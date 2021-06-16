import redis from 'redis';
import { promisify } from 'util';
import { Tokens } from './types';

export default class {
  private redisClient: redis.RedisClient
  private redisGet: (string) => Promise<string>

  constructor(redisClient: redis.RedisClient) {
    this.redisClient = redisClient
    this.redisGet = promisify(redisClient.get);
  }

  public storeTokensInRedis(tokens: Tokens) {
    this.storeKeyValueInRedis(`access_token`, tokens.accessToken);
  }

  public retrieveTokensFromStore = async (): Promise<Tokens> => {
    const accessToken = await this.retrieveKeyValuePairFromRedis(`access_token`)

    let tokens: Tokens = {
      accessToken: accessToken.toString(),
    };

    return tokens
  }

  private storeKeyValueInRedis(key: string, value: string) {
    this.redisClient.set(key,value)
  }

  private retrieveKeyValuePairFromRedis = (key: string): Promise<String> => {
    return this.redisGet(key);
  };
}