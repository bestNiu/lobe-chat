'use client';

import { Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClientDataSWR } from '@/libs/swr';
import { AdminRequestError, youlinAdminService } from '@/services/youlinAdmin';

const MAX_LIMIT = 2_147_483_647;
const parseLimit = (value: string) => (value === '' ? null : Number(value));
const limitIsValid = (value: string) =>
  value === '' ||
  (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= MAX_LIMIT);

export const ModelGovernance = ({ selectedUserId }: { selectedUserId?: string }) => {
  const { t } = useTranslation('common');
  // Always prove this session has the platform's model-governance grant BEFORE showing operator
  // controls. The target lookup never acts as the authorization check for this page.
  // A fresh mount must not reuse another account's cached administrator proof or private data.
  const [viewId] = useState(() => crypto.randomUUID());
  const self = useClientDataSWR(
    `youlin-admin:${viewId}:self`,
    () => youlinAdminService.getAccess(),
    {
      refreshInterval: 30_000,
    },
  );
  const [requestedUser, setRequestedUser] = useState(selectedUserId ?? '');
  const [targetUser, setTargetUser] = useState(selectedUserId ?? '');
  const [model, setModel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [modelLimit, setModelLimit] = useState('');
  const [totalLimit, setTotalLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const target = useClientDataSWR(
    self.data && targetUser ? `youlin-admin:${viewId}:access:${targetUser}` : null,
    () => youlinAdminService.getAccess(targetUser),
    { revalidateOnFocus: false },
  );

  const describeError = (error: unknown) => {
    if (error instanceof AdminRequestError) {
      if (error.status === 401) return t('youlinAdmin.loginRequired');
      if (error.status === 403 || error.status === 404) return t('youlinAdmin.noAccess');
      if (error.status === 409) return t('youlinAdmin.conflict');
    }
    return t('youlinAdmin.tryAgain');
  };
  const submit = async (operation: () => Promise<unknown>) => {
    setSaving(true);
    setMessage('');
    setFailure('');
    try {
      await operation();
      setMessage(t('youlinAdmin.saved'));
      try {
        await target.mutate();
      } catch {
        setFailure(t('youlinAdmin.refreshFailed'));
      }
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setSaving(false);
    }
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    setFailure('');
    setMessage('');
    setTargetUser(requestedUser.trim());
    setModel('');
    setModelLimit('');
    setTotalLimit('');
  };

  if (self.error)
    return (
      <section>
        <h1>{t('youlinAdmin.title')}</h1>
        <p role="alert">{describeError(self.error)}</p>
        {self.error instanceof AdminRequestError && self.error.status === 401 ? (
          <a href="/signin">{t('youlinAdmin.signIn')}</a>
        ) : (
          <Button onClick={() => void self.mutate()}>{t('youlinAdmin.retry')}</Button>
        )}
      </section>
    );
  if (!self.data)
    return (
      <p role="status" style={{ padding: 32 }}>
        {t('youlinAdmin.loading')}
      </p>
    );

  const access = target.data;
  return (
    <section>
      <Flexbox gap={20}>
        <header>
          <h1>{t('youlinAdmin.title')}</h1>
          <p>{t('youlinAdmin.intro')}</p>
        </header>
        <form onSubmit={search}>
          <label htmlFor="youlin-target">{t('youlinAdmin.userId')}</label>{' '}
          <input
            required
            id="youlin-target"
            maxLength={255}
            value={requestedUser}
            onChange={(event) => setRequestedUser(event.target.value)}
          />{' '}
          <Button htmlType="submit">{t('youlinAdmin.lookup')}</Button>
        </form>
        {targetUser && (
          <>
            <h2>{targetUser}</h2>
            {target.error ? (
              <p role="alert">
                {describeError(target.error)}{' '}
                <Button onClick={() => void target.mutate()}>{t('youlinAdmin.retry')}</Button>
              </p>
            ) : !access ? (
              <p role="status">{t('youlinAdmin.loading')}</p>
            ) : (
              <>
                <p>
                  {t('youlinAdmin.usage', {
                    period: access.usage.periodId,
                    tokens: access.usage.totalTokens.toLocaleString(),
                  })}
                </p>
                <p>
                  {t('youlinAdmin.totalCap')}:{' '}
                  {access.quota?.monthlyTotalTokenLimit ?? t('youlinAdmin.unlimited')}
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (limitIsValid(totalLimit))
                      void submit(() =>
                        youlinAdminService.setQuota(targetUser, parseLimit(totalLimit)),
                      );
                  }}
                >
                  <label htmlFor="youlin-total">{t('youlinAdmin.totalCap')}</label>{' '}
                  <input
                    id="youlin-total"
                    max={MAX_LIMIT}
                    min={0}
                    placeholder={t('youlinAdmin.unlimited')}
                    type="number"
                    value={totalLimit}
                    onChange={(event) => setTotalLimit(event.target.value)}
                  />{' '}
                  <Button disabled={saving || !limitIsValid(totalLimit)} htmlType="submit">
                    {t('youlinAdmin.saveCap')}
                  </Button>
                </form>
                <h3>{t('youlinAdmin.grants')}</h3>
                {access.grants.length === 0 ? (
                  <p>{t('youlinAdmin.noGrants')}</p>
                ) : (
                  <ul>
                    {access.grants.map((grant) => (
                      <li key={grant.model}>
                        {grant.model} —{' '}
                        {grant.enabled ? t('youlinAdmin.enabled') : t('youlinAdmin.disabled')} —{' '}
                        {grant.monthlyTokenLimit ?? t('youlinAdmin.unlimited')}{' '}
                        <Button
                          onClick={() => {
                            setModel(grant.model);
                            setEnabled(grant.enabled);
                            setModelLimit(grant.monthlyTokenLimit?.toString() ?? '');
                            setMessage('');
                            setFailure('');
                          }}
                        >
                          {t('youlinAdmin.editGrant')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!limitIsValid(modelLimit) || !model.trim()) return;
                    const previous = access.grants.find((grant) => grant.model === model.trim());
                    if (
                      previous?.enabled &&
                      !enabled &&
                      !window.confirm(t('youlinAdmin.confirmDisable'))
                    )
                      return;
                    void submit(() =>
                      youlinAdminService.setGrant({
                        enabled,
                        model: model.trim(),
                        monthlyTokenLimit: parseLimit(modelLimit),
                        ...(previous?.provider ? { provider: previous.provider } : {}),
                        userId: targetUser,
                      }),
                    );
                  }}
                >
                  <Flexbox gap={12}>
                    <label htmlFor="youlin-model">{t('youlinAdmin.model')}</label>
                    <input
                      required
                      id="youlin-model"
                      maxLength={255}
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                    />
                    <label htmlFor="youlin-enabled">
                      <input
                        checked={enabled}
                        id="youlin-enabled"
                        type="checkbox"
                        onChange={(event) => setEnabled(event.target.checked)}
                      />{' '}
                      {t('youlinAdmin.enabled')}
                    </label>
                    <label htmlFor="youlin-model-limit">{t('youlinAdmin.modelCap')}</label>
                    <input
                      id="youlin-model-limit"
                      max={MAX_LIMIT}
                      min={0}
                      placeholder={t('youlinAdmin.unlimited')}
                      type="number"
                      value={modelLimit}
                      onChange={(event) => setModelLimit(event.target.value)}
                    />
                    <Button disabled={saving || !limitIsValid(modelLimit)} htmlType="submit">
                      {t('youlinAdmin.saveGrant')}
                    </Button>
                  </Flexbox>
                </form>
                {message && <p role="status">{message}</p>}
                {failure && <p role="alert">{failure}</p>}
              </>
            )}
          </>
        )}
      </Flexbox>
    </section>
  );
};
