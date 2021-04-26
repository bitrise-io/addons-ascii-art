import express from 'express';
import OIDC from './oidc';
import ApiClient from './api_client';
import TokenStore from './token_store';
import redis from 'redis';
import figlet from 'figlet';

import setUpBitriseAuth from './bitrise_auth';

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redisUrl = process.env.REDIS_URL;
const realm = process.env.REALM || 'master';

const redisClient = redis.createClient(redisUrl);
const tokenStore = new TokenStore(redisClient);
const authBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io';
const oidc = new OIDC(authBaseURL, realm, clientID, clientSecret, tokenStore);
const apiClient = new ApiClient(oidc, tokenStore);

const cookieParser = require("cookie-parser");
app.use(cookieParser());

// setting up bitrise integration related endpoints
setUpBitriseAuth(app, oidc, apiClient, authBaseURL);

// custom endpoint for the addon, has no connection for Bitrise integration
app.get('/me', async(req, res) => {
  const token = req.cookies.token || '';

  if (!token) {
    return res.status(401).send();
  }

  try {
    const { data } = await apiClient.getMe(token);

    figlet(`Hi ${data['data'].username}`, (err, text: string) => {
      if (err) {
        return res.status(500).end();
      }

      res.end(`<pre>${text.replace(/\n/g, '<br />')}</pre>`);
    });
  } catch(error) {
    console.log(error.response);
    return res.status(error.response.status).send(`token: ${token}`).end();
  }
});

// Testing route not used by Bitrise system
app.get('/', (_, res) => {
  res.send('Welcome to ASCII art').end();
});


app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});
