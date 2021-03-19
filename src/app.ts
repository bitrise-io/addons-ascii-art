import express from 'express';
import axios, { AxiosInstance } from 'axios';
import jwtMiddleware from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import bodyParser from 'body-parser';

const app = express();
const port = process.env.PORT || 3000;
const clientID = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const tokenBaseURL = process.env.TOKEN_BASE_URL || 'https://auth.services.bitrise.io'
const apiBaseURL = process.env.API_BASE_URL || 'https://api.bitrise.io'

const inmemStorage = {
  // "test-app-slug": {
  //   accessToken: "access-token",
  //   refreshToken: "refresh-token",
  // }
};

//
// Routes

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('Welcome to ASCII art');
});


const middleware = jwtMiddleware({
  algorithms: ["RS256"],
  issuer: 'https://auth.services.bitrise.dev/auth/realms/addons',
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: 'https://auth.services.bitrise.dev/auth/realms/addons/protocol/openid-connect/certs'
  }),
});

// -

app.post('/provision', middleware, async (req, res) => {
  const token = getTokenFromHeader(req)

  if (!token) {
    res.status(401).send({ code: 400, message: 'invalid token in Authorization header' });
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
    const response = await axios.post(tokenBaseURL + '/auth/realms/addons/protocol/openid-connect/token', params, config);

    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    inmemStorage[req.body.app_slug] = {
      accessToken: accessToken,
      refreshToken: refreshToken,
    }

    console.log(inmemStorage[req.body.app_slug]);

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
  res.send('hi meercode');
});

// -

app.delete('/provision/{app_slug}', (req, res) => {
});

// -

app.get('/asciiart/{app_slug}', async (req, res) => {
  const axiosApiInstance = getOAuth2ClientForAppSlug(req.params.app_slug)

  try {
    const response = await axiosApiInstance.get(apiBaseURL+ '/apps/' + req.params.app_slug)
    res.send(response.data['data'].title)
  } catch(error) {
    res.status(error.response.status).send(error.response.data);
  }
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

const refreshAccessToken = (appSlug: string): string => {
  const params = new URLSearchParams({
    'grant_type': 'refresh_token',
    'client_id': clientID,
    'refresh_token': inmemStorage[appSlug].refreshToken,
  });

  const config = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }

  axios.post(tokenBaseURL + '/auth/realms/addons/protocol/openid-connect/token', params, config).then(function (response) {
    const accessToken = response.data.access_token;
    const refreshToken = response.data.refresh_token;

    inmemStorage[appSlug] = {
      accessToken: accessToken,
      refreshToken: refreshToken,
    }

    return accessToken
  }).catch(function (error) {
    console.log(error.response.status, error.response.data);
  });
  return ''
}

const getOAuth2ClientForAppSlug = (appSlug: string): AxiosInstance => {
  const axiosApiInstance = axios.create();
  axiosApiInstance.interceptors.request.use(
    async config => {
      config.headers = {
        'Authorization': `Bearer ` + inmemStorage[appSlug].accessToken,
      }
      return config;
    },
    error => {
      Promise.reject(error)
    });

    axiosApiInstance.interceptors.response.use((response) => {
      return response
    }, async function (error) {
      const originalRequest = error.config;
      if (error.response.status === 403 && !originalRequest._retry) {
        originalRequest._retry = true;
        const access_token = refreshAccessToken(appSlug);
        originalRequest.headers['Authorization'] = 'Bearer ' + access_token;
        return axiosApiInstance(originalRequest);
      }
      return Promise.reject(error);
    });

    return axiosApiInstance;
  }