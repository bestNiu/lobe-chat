'use client';

import { Flexbox } from '@lobehub/ui';
import { Button, confirmModal } from '@lobehub/ui/base-ui';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSingleton } from '@/hooks/useSingleton';
import { useClientDataSWR } from '@/libs/swr';
import { AdminRequestError, type ManualUser, youlinAdminService } from '@/services/youlinAdmin';

interface UserDirectoryProps {
  onSelect: (userId: string) => void;
}

export const UserDirectory = ({ onSelect }: UserDirectoryProps) => {
  const { t } = useTranslation('common');
  const [viewId] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [history, setHistory] = useState<Array<string | undefined>>([]);
  const [email, setEmail] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  // A retry of an unconfirmed IdP outcome MUST retain its command id and password.
  const createKey = useRef<null | string>(null);
  const disableKeys = useSingleton(() => new Map<string, string>());
  const page = useClientDataSWR(
    `youlin-admin:${viewId}:users:${cursor ?? 'first'}:${userId}:${employeeFilter}`,
    () =>
      youlinAdminService.listUsers({
        ...(cursor ? { cursor } : {}),
        ...(employeeFilter ? { employeeNumber: employeeFilter } : {}),
        ...(userId ? { userId } : {}),
      }),
  );

  const describeError = (error: unknown) => {
    if (error instanceof AdminRequestError) {
      if (error.status === 401) return t('youlinAdmin.loginRequired');
      if (error.status === 403 || error.status === 404) return t('youlinAdmin.directoryDenied');
      if (error.status === 409) return t('youlinAdmin.conflict');
    }
    return t('youlinAdmin.tryAgain');
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage('');
    setFailure('');
    createKey.current ??= crypto.randomUUID();
    try {
      await youlinAdminService.createUser({
        displayName: displayName.trim() || undefined,
        email: email.trim(),
        employeeNumber: employeeNumber.trim(),
        idempotencyKey: createKey.current,
        initialPassword: password,
      });
      createKey.current = null;
      setUserId('');
      setQuery('');
      setEmployeeQuery(employeeNumber.trim());
      setEmployeeFilter(employeeNumber.trim());
      setCursor(undefined);
      setHistory([]);
      setPassword('');
      setEmail('');
      setEmployeeNumber('');
      setDisplayName('');
      setMessage(t('youlinAdmin.userCreated'));
      try {
        await page.mutate();
      } catch {
        setFailure(t('youlinAdmin.refreshFailed'));
      }
    } catch (error) {
      setFailure(describeError(error));
    } finally {
      setPending(false);
    }
  };
  const disable = (user: ManualUser) => {
    confirmModal({
      title: t('youlinAdmin.confirmUserDisableTitle'),
      content: t('youlinAdmin.confirmUserDisable', { email: user.email ?? user.employeeNumber }),
      okText: t('youlinAdmin.disableUser'),
      cancelText: t('cancel'),
      onOk: async () => {
        if (pending) return;
        setPending(true);
        setMessage('');
        setFailure('');
        const key = disableKeys.get(user.subjectId) ?? crypto.randomUUID();
        disableKeys.set(user.subjectId, key);
        try {
          await youlinAdminService.disableUser({
            expectedAuthEpoch: user.authEpoch,
            expectedAuthorityVersion: user.authorityVersion,
            idempotencyKey: key,
            subjectId: user.subjectId,
          });
          disableKeys.delete(user.subjectId);
          setMessage(t('youlinAdmin.userDisabled'));
          try {
            await page.mutate();
          } catch {
            setFailure(t('youlinAdmin.refreshFailed'));
          }
        } catch (error) {
          if (error instanceof AdminRequestError && error.status === 409)
            disableKeys.delete(user.subjectId);
          setFailure(describeError(error));
        } finally {
          setPending(false);
        }
      },
    });
  };

  return (
    <section>
      <Flexbox gap={16}>
        <h2>{t('youlinAdmin.users')}</h2>
        {!page.error && page.data && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setUserId(query.trim());
              setEmployeeFilter(employeeQuery.trim().toUpperCase());
              setCursor(undefined);
              setHistory([]);
            }}
          >
            <label htmlFor="youlin-user-query">{t('youlinAdmin.searchUserId')}</label>{' '}
            <input
              id="youlin-user-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />{' '}
            <label htmlFor="youlin-employee-query">{t('youlinAdmin.employeeNumber')}</label>{' '}
            <input
              id="youlin-employee-query"
              value={employeeQuery}
              onChange={(event) => setEmployeeQuery(event.target.value)}
            />{' '}
            <Button htmlType="submit">{t('youlinAdmin.lookup')}</Button>
          </form>
        )}
        {page.error ? (
          <p role="alert">
            {describeError(page.error)}{' '}
            <Button onClick={() => void page.mutate()}>{t('youlinAdmin.retry')}</Button>
          </p>
        ) : !page.data ? (
          <p role="status">{t('youlinAdmin.loading')}</p>
        ) : (
          <>
            {page.data.items.length === 0 ? (
              <p>{t('youlinAdmin.noUsers')}</p>
            ) : (
              <ul>
                {page.data.items.map((user) => (
                  <li key={user.subjectId}>
                    {user.employeeNumber} — {user.displayName || user.email || user.userId} —{' '}
                    {user.status}{' '}
                    <Button onClick={() => onSelect(user.userId)}>
                      {t('youlinAdmin.viewAccess')}
                    </Button>{' '}
                    {page.data?.canProvision && user.status === 'active' && (
                      <Button disabled={pending} onClick={() => disable(user)}>
                        {t('youlinAdmin.disableUser')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Flexbox horizontal gap={12}>
              <Button
                disabled={history.length === 0}
                onClick={() => {
                  setCursor(history.at(-1));
                  setHistory(history.slice(0, -1));
                }}
              >
                {t('youlinAdmin.previous')}
              </Button>
              <Button
                disabled={!page.data.nextCursor}
                onClick={() => {
                  const next = page.data?.nextCursor;
                  if (!next) return;
                  setHistory([...history, cursor]);
                  setCursor(next);
                }}
              >
                {t('youlinAdmin.next')}
              </Button>
            </Flexbox>
          </>
        )}
        {!page.error && page.data?.canProvision && (
          <>
            <h3>{t('youlinAdmin.createUser')}</h3>
            <p>{t('youlinAdmin.credentialNote')}</p>
            <form onSubmit={(event) => void create(event)}>
              <Flexbox gap={12}>
                <label htmlFor="youlin-employee">{t('youlinAdmin.employeeNumber')}</label>
                <input
                  required
                  id="youlin-employee"
                  maxLength={128}
                  pattern="[A-Z0-9][A-Z0-9._:-]*"
                  value={employeeNumber}
                  onChange={(event) => {
                    setEmployeeNumber(event.target.value.toUpperCase());
                    createKey.current = null;
                  }}
                />
                <label htmlFor="youlin-email">{t('youlinAdmin.email')}</label>
                <input
                  required
                  id="youlin-email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    createKey.current = null;
                  }}
                />
                <label htmlFor="youlin-name">{t('youlinAdmin.name')}</label>
                <input
                  id="youlin-name"
                  maxLength={255}
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    createKey.current = null;
                  }}
                />
                <label htmlFor="youlin-initial-password">{t('youlinAdmin.initialPassword')}</label>
                <input
                  required
                  autoComplete="new-password"
                  id="youlin-initial-password"
                  minLength={12}
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    createKey.current = null;
                  }}
                />
                <Button disabled={pending} htmlType="submit">
                  {t('youlinAdmin.createUser')}
                </Button>
              </Flexbox>
            </form>
          </>
        )}
        {message && <p role="status">{message}</p>}
        {failure && <p role="alert">{failure}</p>}
      </Flexbox>
    </section>
  );
};
