import redis = require('redis');
import { Tokens } from './types';

export default class {
  private redisClient: redis.RedisClient

  constructor(redisClient: redis.RedisClient) {
    this.redisClient = redisClient
  }

  public storeTokensInRedis(appSlug: string, tokens: Tokens) {
    this.storeKeyValueInRedis(`access_token_${appSlug}`, tokens.accessToken)
    this.storeKeyValueInRedis(`refresh_token_${appSlug}`, tokens.refreshToken)
  }

  public retrieveTokensFromStore = async (appSlug: string): Promise<Tokens> =>{
    const accessToken: String = await this.retrieveKeyValuePairFromRedis((`access_token_${appSlug}`))
    const refreshToken: String = await this.retrieveKeyValuePairFromRedis((`refresh_token_${appSlug}`))

    let tokens: Tokens = {
      accessToken: accessToken.toString(),
      refreshToken: refreshToken.toString()
    };

    return tokens
  }

  private storeKeyValueInRedis(key: string, value: string) {
    this.redisClient.set(key,value)
  }

  private retrieveKeyValuePairFromRedis = (key: string): Promise<String> => {
    return new Promise<String>((resolve, reject) => {
      this.redisClient.get(key, function(err, reply) {
        if (err!=null) {
          throw new Error(`${key} not found`)
        }
        resolve(reply)
      })
    })
  };
}