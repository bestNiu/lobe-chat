import OpenAI from 'openai';

import { checkAuth } from '@/app/api/auth';
import { getServerConfig } from '@/config/server';
import { getOpenAIAuthFromRequest } from '@/const/fetch';
import { ChatErrorType, ErrorType } from '@/types/fetch';

import { createErrorResponse } from '../errorResponse';
import { createAzureOpenai } from './createAzureOpenai';
import { createOpenai } from './createOpenai';
import { checkAccessCodeUsage } from './rateLimiter';

/**
 * createOpenAI Instance with Auth and azure openai support
 * if auth not pass ,just return error response
 */
export const createBizOpenAI = (req: Request, model: string): Response | OpenAI => {
  const { apiKey, accessCode, endpoint, useAzure, apiVersion,userIp } = getOpenAIAuthFromRequest(req);

  const result = checkAuth({ accessCode, apiKey });

  if (!result.auth) {
    return createErrorResponse(result.error as ErrorType);
  }


  // 检查 accessCode 和 userIp 是否为 null，并且是字符串
  if (typeof accessCode === 'string' && typeof userIp === 'string') {
    // 由于我们已经检查了它们是字符串，这里可以安全地调用函数
    if (checkAccessCodeUsage(accessCode, userIp)) {
      return createErrorResponse(ChatErrorType.InvalidAccessCode as ErrorType);
      // 其他错误处理...
    }
  } else {
    // 如果 accessCode 或 userIp 是 null，处理错误情况
    // 你可以返回一个错误响应或者抛出一个错误
    return createErrorResponse(ChatErrorType.MissingRequiredInformation as ErrorType);
    // 或者抛出一个错误
    // throw new Error('accessCode and userIp must be strings');
  }

  let openai: OpenAI;

  const { USE_AZURE_OPENAI } = getServerConfig();
  const useAzureOpenAI = useAzure || USE_AZURE_OPENAI;

  try {
    if (useAzureOpenAI) {
      openai = createAzureOpenai({ apiVersion, endpoint, model, userApiKey: apiKey });
    } else {
      openai = createOpenai(apiKey, endpoint);
    }
  } catch (error) {
    if ((error as Error).cause === ChatErrorType.NoAPIKey) {
      return createErrorResponse(ChatErrorType.NoAPIKey);
    }

    console.error(error); // log error to trace it
    return createErrorResponse(ChatErrorType.InternalServerError);
  }

  return openai;
};


