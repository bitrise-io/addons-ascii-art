import redis from 'redis';
import { Tokens } from './types';

export default class {
  private redisClient: redis.RedisClient

  constructor(redisClient: redis.RedisClient) {
    this.redisClient = redisClient
  }

  public storeTokensInRedis(tokens: Tokens) {
    this.storeKeyValueInRedis(`access_token`, tokens.accessToken)
    this.storeKeyValueInRedis(`refresh_token`, tokens.refreshToken)
  }

  public retrieveTokensFromStore = async (): Promise<Tokens> => {
    const accessToken = await this.retrieveKeyValuePairFromRedis(`access_token`)
    const refreshToken  = await this.retrieveKeyValuePairFromRedis(`refresh_token`)

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