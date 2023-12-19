const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error : ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//API 1 Register User
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUser = `
        SELECT *
        FROM user 
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(checkUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const requestQuery = `
                INSERT INTO 
                    user (name, username, password, gender)
                VALUES (
                    '${name}',
                    '${username}',
                    '${hashedPassword}',
                    '${gender}'
                );
            `;
      await db.run(requestQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2 Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `
        SELECT *
        FROM user 
        WHERE username = '${username}';
    `;
  const dbUser = await db.get(checkUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication with JWT Token

const authenticateToken = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 3 Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
  const getUserId = await db.get(getUserQuery);

  const getFollowerIdsQuery = `
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id = '${getUserId.user_id}';
    `;
  const getFollowerIds = await db.all(getFollowerIdsQuery);

  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getTweetQuery = `
        SELECT 
            user.username,
            tweet.tweet,
            tweet.date_time as dateTime
        FROM user INNER JOIN tweet 
            ON user.user_id = tweet.user_id
        WHERE user.user_id in (${getFollowerIdsSimple})
        ORDER BY tweet.date_time DESC 
        LIMIT 4 ;
    `;
  const responseResult = await db.all(getTweetQuery);
  response.send(responseResult);
});

//API 4 Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
  const getUserId = await db.get(getUserQuery);

  const getFollowerIdsQuery = `
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id = '${getUserId.user_id}';
    `;
  const getFollowerIdsArray = await db.all(getFollowerIdsQuery);

  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });

  const getFollowersResultQuery = `
        SELECT name
        FROM user
        WHERE user_id in (${getFollowerIds});
    `;

  const responseResult = await db.all(getFollowersResultQuery);
  response.send(responseResult);
});

//API 5 Returns the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowerIdsQuery = `
        SELECT follower_user_id 
        FROM follower
        WHERE following_user_id = '${getUserId.user_id}';
    `;
  const getFollowerIdsArray = await db.all(getFollowerIdsQuery);

  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  const getFollowersNameQuery = `
        SELECT name
        FROM user
        WHERE user_id in (${getFollowerIds});
    `;

  const getFollowersName = await db.all(getFollowersNameQuery);
  response.send(getFollowersName);
});

//API 6 If the user requests a tweet other than the users he is following

const api6Output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;

  const getUserIdQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
  const getUserId = await db.get(getUserIdQuery);

  const getFollowingIdsQuery = `
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${getUserId.user_id};
    `;
  const getFollowingIdsArray = await db.all(getFollowingIdsQuery);

  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });

  const getTweetIdsQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id in (${getFollowingIds});
    `;
  const getTweetIdsArray = await db.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `
            SELECT 
                COUNT(user_id) as likes
            FROM like 
            WHERE tweet_id = ${tweetId};
        `;
    const likes_count = await db.get(likes_count_query);
    //console.log(likes_count);

    const reply_count_query = `
            SELECT 
                COUNT(user_id) as replies
            FROM reply
            WHERE tweet_id = ${tweetId};
        `;
    const reply_count = await db.get(reply_count_query);
    //console.log(reply_count);

    const tweet_tweetDateQuery = `
            SELECT 
                tweet, 
                date_time
            FROM tweet 
            WHERE tweet_id = ${tweetId}
        `;
    const tweet_tweetDate = await db.get(tweet_tweetDateQuery);
    //console.log(tweet_tweetDate);

    response.send(api6Output(tweet_tweetDate, likes_count, reply_count));
  } else {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});

//API 7 If the user requests a tweet other than the users he is following
const convertLikeUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserIdQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
    const getUserId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${getUserId.user_id};
    `;
    const getFollowingIdsArray = await db.all(getFollowingIdsQuery);

    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });

    const getTweetIdsQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id in (${getFollowingIds});
    `;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikeUsersNameQuery = `
            SELECT
                user.username As likes
            FROM 
                user INNER JOIN like ON user.user_id = like.user_id
            WHERE like.tweet_id = ${tweetId};
        `;
      const getLikeUserNamesArray = await db.all(getLikeUsersNameQuery);

      const getLikeUserNames = getLikeUserNamesArray.map((eachUser) => {
        return eachUser.likes;
      });

      response.send(
        convertLikeUserNameDBObjectToResponseObject(getLikeUserNames)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8 If the user requests a tweet other than the users he is following
const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;

    const getUserIdQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
    const getUserId = await db.get(getUserIdQuery);

    const getFollowingIdsQuery = `
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${getUserId.user_id};
    `;
    const getFollowingIdsArray = await db.all(getFollowingIdsQuery);

    const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
      return eachFollower.following_user_id;
    });

    const getTweetIdsQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id in (${getFollowingIds});
    `;
    const getTweetIdsArray = await db.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUsernameReplyTweetQuery = `
            SELECT 
                user.name,
                reply.reply 
            FROM user INNER JOIN reply ON user.user_id = reply.user_id
            WHERE reply.tweet_id = ${tweetId};
        `;
      const getUsernameReplyTweets = await db.all(getUsernameReplyTweetQuery);

      response.send(
        convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
      );
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9 Returns a list of all tweets of the user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetQuery = `
        SELECT tweet,
            COUNT(DISTINCT like_id) AS likes,
            COUNT(DISTINCT reply_id) AS replies,
            date_time As dateTime
        FROM tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id LEFT JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE tweet.user_id = ${userId}
        GROUP BY tweet.tweet_id;
    `;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

//API 10 Create a tweet in the tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
  const getUserId = await db.get(getUserIdQuery);

  const { tweet } = request.body;

  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `
    INSERT INTO 
        tweet (tweet, user_id, date_time)
    VALUES (
        '${tweet}',
        '${getUserId.user_id}',
        '${currentDate}'
    );
  `;
  const responseResult = await db.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `
        SELECT user_id 
        FROM user 
        WHERE username = '${username}';
    `;
    const getUserId = await db.get(getUserIdQuery);

    const getUserTweetsListQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id = ${getUserId.user_id};
    `;
    const getUserTweetsListArray = await db.all(getUserTweetsListQuery);
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });

    console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `
            DELETE FROM tweet 
            WHERE tweet_id =${tweetId};
        `;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
