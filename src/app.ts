import express from 'express';
import axios, { AxiosInstance } from 'axios';
import jwtMiddleware from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import bodyParser from 'body-parser';
import OIDC from './oidc';

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const authBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io'
const apiBaseURL = process.env.API_BASE_URL || 'https://api.bitrise.io/v0.2'
const inMemStorage = {};
const oidc = new OIDC(authBaseURL, inMemStorage);

//
// Routes

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Welcome to ASCII art').end();
});


const middleware = jwtMiddleware({
  algorithms: ["RS256"],
  issuer: authBaseURL+'/auth/realms/addons',
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: authBaseURL+'/auth/realms/addons/protocol/openid-connect/certs'
  }),
});

// -

app.get('/asciiart/:app_slug', async (req, res) => {
  try {
    const response = await oidc.axiosClient(req.params.app_slug,clientID).get(apiBaseURL+ '/apps/' + req.params.app_slug)
    res.send(response.data['data'].title).end();
  } catch(error) {
    if (error.response) {
      return res.status(error.response.status).send(error.response.data).end();
    }
    res.status(400).send(error.message).end();
  }
});

// -

app.post('/provision', middleware, async (req, res) => {
  const token = getTokenFromHeader(req)

  if (!token) {
    res.status(401).send({ code: 400, message: 'invalid token in Authorization header' }).end();
    return;
  }

  const params = new URLSearchParams({
    'grant_type': 'urn:ietf:params:oauth:grant-type:token-exchange',
    'client_id': clientID,
    'client_secret': clientSecret,
    'subject_token': token,
    'requested_token_type': 'urn:ietf:params:oauth:token-type:refresh_token'
  });

  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  try {
    const response = await axios.post(authBaseURL + '/auth/realms/addons/protocol/openid-connect/token', params, config);

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    inMemStorage[req.body.app_slug] = {
      accessToken: accessToken,
      refreshToken: refreshToken,
    }

    res.sendStatus(200).end();
  } catch(error) {
    if (error.response) {
      return res.status(error.response.status).send(error.response.data).end();
    }
    res.status(400).end();
  }
});

// -

app.post('/login', (req, res) => {
  res.send('hi meercode').end();
});

// -

app.delete('/provision/:app_slug', (req, res) => {
});

//
// main

app.listen(port, () => {
  return console.log(`server is listening on ${port}`);
});

let getTokenFromHeader = (req: any): string | undefined => {
  const bearerPrefixLen = 'bearer '.length
  let token = req.headers.authorization

  if (!token || token.length < bearerPrefixLen) {
    return undefined;
  }

  return token.substr(bearerPrefixLen);
}
