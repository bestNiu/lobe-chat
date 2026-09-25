import { REQUEST_TOPIC_ID_HEADER } from '@lobechat/const';
import { type ChatCompletionErrorPayload } from '@lobechat/model-runtime';
import { AGENT_RUNTIME_ERROR_SET } from '@lobechat/model-runtime';
import { ChatErrorType } from '@lobechat/types';

import { checkAuth } from '@/app/(backend)/middleware/auth';
import { createTraceOptions, initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';
import { evaluateChatModelAccess } from '@/server/modules/YoulinModelGovernance/accessControl';
import { isYoulinModelAccessControlEnabled } from '@/server/modules/YoulinModelGovernance/featureConfig';
import { isYoulinUsageAccountingEnabled } from '@/server/modules/YoulinUsage/featureConfig';
import { newUsageOperationId, recordChatUsage } from '@/server/modules/YoulinUsage/recordChatUsage';
import { type ChatStreamPayload } from '@/types/openai/chat';
import { createErrorResponse } from '@/utils/errorResponse';
import { getTracePayload } from '@/utils/trace';

import { resolveValidWorkspaceIdFromRequest } from '../../_utils/workspace';

// If user don't use fluid compute, will build  failed
// this enforce user to enable fluid compute
export const maxDuration = 300;

export const POST = checkAuth(async (req: Request, { params, userId, serverDB }) => {
  const provider = (await params)!.provider!;

  try {
    const workspaceId = await resolveValidWorkspaceIdFromRequest({ req, serverDB, userId });

    // ============  1. init chat model   ============ //
    const modelRuntime = await initModelRuntimeFromDB(serverDB, userId, provider, workspaceId);

    // ============  2. create chat completion   ============ //

    const data = (await req.json()) as ChatStreamPayload;

    // Enterprise model governance (default off): decide before any provider work and fail closed.
    // An unreadable grant table or ledger refuses the turn instead of allowing unbounded spend.
    if (isYoulinModelAccessControlEnabled()) {
      const decision = await evaluateChatModelAccess({
        db: serverDB,
        model: data.model,
        provider,
        userId,
      });
      if (decision.reason !== 'ALLOWED')
        return Response.json(
          { error: decision.reason, periodId: decision.periodId ?? null },
          {
            headers: { 'cache-control': 'no-store' },
            status: decision.reason === 'INVALID_INPUT' ? 400 : 403,
          },
        );
    }

    const tracePayload = getTracePayload(req);

    let traceOptions = {};
    // If user enable trace
    if (tracePayload?.enabled) {
      traceOptions = createTraceOptions(data, { provider, trace: tracePayload });
    }

    // Enterprise token accounting (default off). This route streams straight to the browser and the
    // runtime normalises provider chunks, so the runtime's own `onUsage` callback is the only
    // trustworthy server-side observation point for a turn's real token usage.
    const accounting = isYoulinUsageAccountingEnabled();
    const topicId = req.headers.get(REQUEST_TOPIC_ID_HEADER) ?? undefined;
    const chatOptions: Parameters<typeof modelRuntime.chat>[1] = {
      user: userId,
      ...traceOptions,
      metadata: { topicId },
      signal: req.signal,
    };

    if (accounting) {
      const operationId = newUsageOperationId();
      const previous = chatOptions.callback;
      chatOptions.callback = {
        ...previous,
        onUsage: (usage) =>
          // Accounting must never break an answer: record, chain any tracing hook, swallow errors.
          Promise.all([
            recordChatUsage({
              model: data.model,
              operationId,
              provider,
              serverDB,
              topicId,
              usage,
              userId,
              workspaceId,
            }),
            previous?.onUsage?.(usage),
          ]).then(() => {}),
      };
    }

    return await modelRuntime.chat(data, chatOptions);
  } catch (e) {
    const {
      errorType = ChatErrorType.InternalServerError,
      error: errorContent,
      ...res
    } = e as ChatCompletionErrorPayload;

    const error = errorContent || e;

    // track the error at server side
    if (AGENT_RUNTIME_ERROR_SET.has(errorType as string)) {
      console.warn(`Route: [${provider}] ${errorType}:`, error);
    } else {
      console.error(`Route: [${provider}] ${errorType}:`, error);
    }

    return createErrorResponse(errorType, { error, ...res, provider });
  }
});
