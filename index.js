import 'dotenv/config';

import { TwitterApi } from 'twitter-api-v2';
import express from 'express';
import session from 'express-session';
import multer from 'multer';

const app = express();
const port = process.env.PORT || 3000;

// To store tokens in the session (in-memory, by default).
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

// Set the view engine to pug.
app.set('view engine', 'pug');

// Multer to handle file uploads.
const upload = multer({ dest: "uploads/" });

const callbackPath = '/auth/twitter';
const callbackUrl = `http://localhost:${port}${callbackPath}`;

function getClient(accessToken = null, accessSecret = null) {
  return new TwitterApi({
    appKey: process.env.CONSUMER_KEY,
    appSecret: process.env.CONSUMER_SECRET,
    accessToken,
    accessSecret,
  });
}

// Home page, login link or user info and form to tweet.
app.get('/', async (req, res) => {
  const { accessToken, accessSecret } = req.session;

  if (accessToken && accessSecret) {
    const client = getClient(accessToken, accessSecret);

    const user = await client.currentUser();

    // This throws 403...
    // const userTimeline = await client.v1.userTimeline(user.id, { include_entities: true });

    // This too...
    // const userTimeline = await client.v2.userTimeline(user.id);

    res.render('index', { user });
  } else {
    res.render('index');
  }
});

// Step 1: Get the OAuth request token, save it in the session and redirect to Twitter.
app.get('/auth', async (req, res) => {
  const client = getClient();
  const auth = await client.generateAuthLink(callbackUrl);

  if (auth.oauth_callback_confirmed !== 'true') {
    res.writeHead(400);
    res.end('Invalid callback');
  }

  req.session.oauthToken = auth.oauth_token;
  req.session.oauthTokenSecret = auth.oauth_token_secret;

  res.redirect(auth.url);
});

// Step 2: Get the OAuth access token, save it in the session and redirect to home.
app.get(callbackPath, async (req, res) => {
  const { oauth_token: oauthToken, oauth_verifier: oauthVerifier } = req.query;
  const { oauthTokenSecret } = req.session;

  if (!oauthToken || !oauthVerifier || !oauthTokenSecret) {
    res.writeHead(400);
    res.end('Access denied or session expired');
  }

  const client = getClient(oauthToken, oauthTokenSecret);
  const { accessToken, accessSecret } = await client.login(oauthVerifier);

  req.session.accessToken = accessToken;
  req.session.accessSecret = accessSecret;

  res.redirect('/');
});

// Receives tweet from the form and posts them.
app.post('/tweet', upload.single('image'), async (req, res) => {
  const { accessToken, accessSecret } = req.session;

  const client = getClient(accessToken, accessSecret);
  const status = req.body.status;
  const image = req.file;

  let response;

  if (image) {
    const mediaId = await client.v1.uploadMedia(image.path, { mimeType: image.mimetype });

    // This throws 403...
    // tweet = await client.v1.tweet(status, { media_ids: [mediaId] });

    // This works.
    response = await client.v2.tweet(status, { media: { media_ids: [mediaId] } });
  } else {
    response = await client.v2.tweet(status);
  }

  console.log('Post tweet response:', response);

  res.redirect('/');
});

app.get('/logout', async (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
