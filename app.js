const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
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
}

// API 1

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  console.log("hi");
  if (dbUser === undefined) {
    if (password.length <= 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
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

// API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
  const { user_id } = getUserId;

  const getQuery = `
    SELECT user.username, tweet.tweet, tweet.date_time FROM follower
  INNER JOIN  tweet ON follower.following_user_id = tweet.user_id
  INNER JOIN user ON user.user_id = follower.following_user_id
  WHERE follower.follower_user_id = ${user_id}
  ORDER BY tweet.date_time desc
  LIMIT 4;
    `;
  const tweetsArray = await db.all(getQuery);
  response.send(
    tweetsArray.map((each) => ({
      username: each.username,
      tweet: each.tweet,
      dateTime: each.date_time,
    }))
  );
});

// API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
  const { user_id } = getUserId;

  const getQuery = `
    SELECT name FROM follower
  inner join user on follower.following_user_id = user.user_id
WHERE follower.follower_user_id = ${user_id};
  `;

  const following = await db.all(getQuery);
  response.send(following);
});

// API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
  const { user_id } = getUserId;

  const getQuery = `
   SELECT name FROM follower
  inner join user on follower.follower_user_id = user.user_id
WHERE follower.following_user_id = ${user_id};
  `;

  const following = await db.all(getQuery);
  response.send(following);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
  const { user_id } = getUserId;
  const { tweetId } = request.params;

  const getQuery = `
   select tweet.tweet, tweet.date_time from tweet
   inner join follower on follower.following_user_id = tweet.user_id
   where follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId};;
  `;
  const dateTimeList = await db.get(getQuery);
  const getLikesQuery = `
    select count(like_id) as likes from like
    where tweet_id = ${tweetId}
  `;
  const likesList = await db.get(getLikesQuery);

  const getReplyQuery = `
    select count(reply_id) as replies from reply
    where tweet_id = ${tweetId}
  `;
  const replyList = await db.get(getReplyQuery);

  if (dateTimeList === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send({
      tweet: dateTimeList.tweet,
      likes: likesList.likes,
      replies: replyList.replies,
      dateTime: dateTimeList.date_time,
    });
  }
});

// API 7

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { username } = request;

    const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
    const { user_id } = getUserId;
    const { tweetId } = request.params;

    const getQuery = `
   select * from tweet
   inner join follower on follower.following_user_id = tweet.user_id
   where follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId};;
  `;
    const tweetList = await db.get(getQuery);

    const getLikesQuery = `
    select user.username from like
    inner join user on like.user_id = user.user_id
    where like.tweet_id = ${tweetId}
  `;

    const likesNamesListObjs = await db.all(getLikesQuery);
    // console.log(likesNamesListObjs);
    const likesList = likesNamesListObjs.map((each) => each.username);
    //console.log(likesList);

    if (tweetList === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ likes: likesList });
    }
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;

    const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
    const { user_id } = getUserId;
    const { tweetId } = request.params;

    const getQuery = `
   select * from tweet
   inner join follower on follower.following_user_id = tweet.user_id
   where follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId};;
  `;
    const tweetList = await db.get(getQuery);

    const getRepliesQuery = `
    select user.name , reply.reply from reply
    inner join user on reply.user_id = user.user_id
    where reply.tweet_id = ${tweetId}
  `;

    const repliesNamesObjs = await db.all(getRepliesQuery);
    // console.log(repliesNamesObjs);

    if (tweetList === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({ replies: repliesNamesObjs });
    }
  }
);

// API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
  const { user_id } = getUserId;

  const getLikesQuery = `
    select count(like.like_id) as likes from tweet
    left join like on like.tweet_id = tweet.tweet_id
    where tweet.user_id = ${user_id}
    group by tweet.tweet_id
  `;
  const likesList = await db.all(getLikesQuery);

  const getReplyQuery = `
    select count(reply.reply_id) as replies from tweet
    left join reply on reply.tweet_id = tweet.tweet_id
    where tweet.user_id = ${user_id}
    group by tweet.tweet_id
  `;
  const replyList = await db.all(getReplyQuery);

  const getTweetAndDateTime = `
    select tweet, date_time from tweet
    where user_id = ${user_id}
  `;

  const dateTimeList = await db.all(getTweetAndDateTime);
  const newList = dateTimeList.map((each, index) => ({
    tweet: each.tweet,
    likes: likesList[index].likes,
    replies: replyList[index].replies,
    dateTime: each.date_time,
  }));
  response.send(newList);
});

//API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
  const { user_id } = getUserId;

  const { tweet } = request.body;

  const dateTime = new Date();
  const month = ("0" + (dateTime.getMonth() + 1)).slice(-2);
  const date = ("0" + dateTime.getDate()).slice(-2);
  const hours = ("0" + dateTime.getHours()).slice(-2);
  const minutes = ("0" + dateTime.getMinutes()).slice(-2);
  const seconds = ("0" + dateTime.getSeconds()).slice(-2);
  const parsedDateTime = `${dateTime.getFullYear()}-${month}-${date} ${hours}:${minutes}:${seconds}`;
  //console.log(parsedDateTime);

  const postQuery = `
    Insert into
    tweet(tweet, user_id, date_time)
    values
    ('${tweet}', ${user_id}, '${parsedDateTime}')
  `;
  await db.run(postQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;

    const getUserId = await db.get(`
    select user_id from user where username = "${username}"
  `);
    const { user_id } = getUserId;
    const { tweetId } = request.params;

    const deleteQuery = `
        Delete from
        tweet
        where tweet_id = ${tweetId} and user_id = ${user_id}
    `;

    const dbResponse = await db.run(deleteQuery);
    if (dbResponse.changes === 1) {
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
