// Protocol driver for synthetic tests, not a production OAuth client or browser acceptance.
import { createHash, randomBytes } from 'node:crypto';

import { parseHTML } from 'linkedom';

export const createProtocolBrowser = (
  issuer,
  clientId = 'youlin-web',
  redirect = 'http://127.0.0.1:3210/callback',
) => {
  const cookies = new Map();
  const request = async (url, options = {}, redirects = 0) => {
    if (redirects > 8) throw new Error('Too many authentication redirects');
    if (new URL(url).origin !== new URL(issuer).origin)
      throw new Error('Refuse cross-origin credential forwarding');
    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: {
        ...options.headers,
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const split = pair.indexOf('=');
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const location = response.headers.get('location');
    if (
      response.status >= 300 &&
      response.status < 400 &&
      location &&
      new URL(location, url).origin === new URL(issuer).origin
    )
      return request(new URL(location, url).href, {}, redirects + 1);
    return response;
  };
  const authorize = async ({ username, password, pkce = true } = {}) => {
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(24).toString('hex');
    const nonce = randomBytes(24).toString('hex');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
    });
    if (pkce) {
      params.set('code_challenge_method', 'S256');
      params.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
    }
    let response = await request(`${issuer}/protocol/openid-connect/auth?${params}`);
    let html = await response.text();
    const { document } = parseHTML(html);
    const form = document.querySelector('form#kc-form-login');
    if (form && username !== undefined) {
      const body = new URLSearchParams({ username, password });
      for (const hidden of form.querySelectorAll('input[type=hidden][name]'))
        body.set(hidden.name, hidden.value);
      response = await request(form.getAttribute('action'), { method: 'POST', body });
      html = await response.text();
    }
    const location = response.headers.get('location');
    const callback = location ? new URL(location) : null;
    const code = callback?.searchParams.get('code');
    if (
      code &&
      (callback.origin + callback.pathname !== redirect ||
        callback.searchParams.get('state') !== state)
    )
      throw new Error('Invalid authorization response binding');
    return {
      code,
      error: callback?.searchParams.get('error'),
      html,
      nonce,
      redirect,
      state,
      status: response.status,
      verifier,
    };
  };
  const submit = async (login, fields) => {
    const { document } = parseHTML(login.html);
    const form = document.querySelector('form');
    if (!form) throw new Error('Authentication continuation form missing');
    const body = new URLSearchParams(fields);
    for (const input of form.querySelectorAll('input[type=hidden][name]'))
      body.set(input.name, input.value);
    const response = await request(form.getAttribute('action'), { method: 'POST', body });
    const html = await response.text();
    const location = response.headers.get('location');
    const callback = location ? new URL(location) : null;
    const code = callback?.searchParams.get('code');
    if (
      code &&
      (callback.origin + callback.pathname !== login.redirect ||
        callback.searchParams.get('state') !== login.state)
    )
      throw new Error('Invalid continuation response binding');
    return { ...login, code, html, status: response.status };
  };
  return { authorize, request, submit };
};

export const exchange = async (
  issuer,
  login,
  { clientId = 'youlin-web', secret, verifier = login.verifier } = {},
) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: login.redirect,
    code: login.code,
    code_verifier: verifier,
  });
  if (secret) body.set('client_secret', secret);
  return fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(5000),
  });
};
