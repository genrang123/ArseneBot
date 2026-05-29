#!/usr/bin/env node
/**
 * Auto-login to YouTube using Playwright + persistent Chromium profile.
 *
 * Env:
 *   GMAIL_USER, GMAIL_PASS         - credentials
 *   CHROMIUM_PROFILE               - persistent directory
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE - chromium binary
 *   REFRESH_YT_AUTH_TIMEOUT        - ms before giving up (default: 90 000)
 */

require('dotenv').config();

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { CHROMIUM_PROFILE_DIR: PROFILE } = require('../src/music/authConfig');

const CHROME_BIN = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/lib/chromium/chrome';
const TIMEOUT = parseInt(process.env.REFRESH_YT_AUTH_TIMEOUT || '90000', 10);
const HEADLESS = process.env.REFRESH_YT_AUTH_HEADLESS === 'true';
const DEBUG_DIR = process.env.REFRESH_YT_AUTH_DEBUG_DIR || '/tmp/yt-auth-debug';
const DEBUG_ENABLED = process.env.YT_AUTH_DEBUG === '1';

const log = {
  info: (...a) => console.log('[yt-auth]', ...a),
  warn: (...a) => console.warn('[yt-auth]', ...a),
  error: (...a) => console.error('[yt-auth]', ...a),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeName(value) {
  return String(value || 'step').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

async function waitVisible(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { state: 'visible', timeout });
    return page.locator(selector).first();
  } catch {
    return null;
  }
}

async function debugState(page, label) {
  if (!DEBUG_ENABLED) return;
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const ts = Date.now();
  const base = `${ts}-${safeName(label)}`;
  const screenshotPath = path.join(DEBUG_DIR, `${base}.png`);
  const htmlPath = path.join(DEBUG_DIR, `${base}.html`);
  const url = page.url();

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (err) {
    log.warn(`Failed to capture screenshot for ${label}: ${err.message}`);
  }

  try {
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
  } catch (err) {
    log.warn(`Failed to capture HTML for ${label}: ${err.message}`);
  }

  log.info(`[state:${label}] url=${url}`);
  log.info(`[state:${label}] screenshot=${screenshotPath}`);
  log.info(`[state:${label}] html=${htmlPath}`);
}

async function clickAndTrack(page, locator, label, delayMs = 2000) {
  log.info(`[step] ${label} click-start url=${page.url()}`);
  try {
    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {}),
      locator.click({ timeout: 10000 }),
    ]);
  } catch (err) {
    log.warn(`[step] ${label} primary-click-failed err=${err.message}`);
    try {
      await locator.click({ timeout: 10000, force: true });
    } catch (forceErr) {
      log.warn(`[step] ${label} force-click-failed err=${forceErr.message}`);
      return false;
    }
  }

  await sleep(delayMs);
  log.info(`[step] ${label} click-done url=${page.url()}`);
  await debugState(page, label);
  return true;
}

async function fillAndWait(locator, value, delayMs = 600) {
  try {
    await locator.fill(value, { timeout: 8000 });
  } catch {
    await locator.type(value, { delay: 50, timeout: 8000 });
  }
  await sleep(delayMs);
}

async function isSignedIn(page) {
  const avatarBtn = await waitVisible(
    page,
    'button[aria-label*="your channel"i], button[aria-label*="google account"i], button[aria-label*="tài khoản"i], #avatar-btn, yt-avatar-shield',
    5000,
  );
  if (avatarBtn) return true;

  const signBtn = await waitVisible(
    page,
    'a[aria-label*="sign in"i], a[aria-label*="đăng nhập"i], a[href*="accounts.google.com"]',
    3000,
  );
  return !signBtn;
}

async function findFirstVisible(page, selectors, timeout = 8000) {
  for (const selector of selectors) {
    const locator = await waitVisible(page, selector, timeout);
    if (locator) {
      return { selector, locator };
    }
  }
  return null;
}

async function continueFromAccountChooser(page, password) {
  const accountChooser = await findFirstVisible(page, [
    'div[data-email]',
    'li [data-identifier]',
    'div[role="link"][data-identifier]',
    'div[role="button"][data-identifier]',
  ], 8000);

  if (accountChooser) {
    log.info(`[step] account-chooser found selector=${accountChooser.selector}`);
    await clickAndTrack(page, accountChooser.locator, 'account-chooser', 3000);
  }

  const pwInput = await waitVisible(page, 'input[type="password"]', 20000);
  if (!pwInput) {
    log.warn('No password input found after account chooser / email step');
    return false;
  }

  log.info('[step] filling-password');
  await fillAndWait(pwInput, password, 800);
  await debugState(page, 'password-filled');

  const pwNext = await findFirstVisible(page, [
    '#passwordNext button',
    '#passwordNext div[role="button"]',
    'button:has-text("Next")',
    'button:has-text("Tiếp theo")',
    'div[role="button"]:has-text("Next")',
    'div[role="button"]:has-text("Tiếp theo")',
  ], 10000);

  if (!pwNext) {
    log.warn('Password Next button not found');
    return false;
  }

  await clickAndTrack(page, pwNext.locator, 'password-next', 5000);
  return true;
}

async function detectGooglePromptChallenge(page) {
  const url = page.url();
  if (!url.includes('/challenge/dp')) return null;

  const details = await page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || '';
    const heading = text('h1, [role="heading"]');
    const subheading = text('h2');
    const body = Array.from(document.querySelectorAll('div, p, span'))
      .map((node) => node.textContent?.trim() || '')
      .find((value) => /Google sent a notification|Tap Yes|check your/i.test(value)) || '';
    const deviceText = [heading, subheading, body]
      .find((value) => /check your /i.test(value)) || '';
    const match = deviceText.match(/check your\s+(.+)/i);
    const tryAnotherWay = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
      .map((node) => node.textContent?.trim() || '')
      .find((value) => /try another way/i.test(value)) || '';
    const resend = Array.from(document.querySelectorAll('button, a, div[role="button"]'))
      .map((node) => node.textContent?.trim() || '')
      .find((value) => /resend it/i.test(value)) || '';
    return {
      heading,
      body,
      deviceName: match?.[1]?.trim() || '',
      hasTryAnotherWay: Boolean(tryAnotherWay),
      hasResend: Boolean(resend),
    };
  });

  return {
    url,
    heading: details.heading || 'Google Prompt',
    body: details.body || '',
    deviceName: details.deviceName || 'trusted phone',
    hasTryAnotherWay: details.hasTryAnotherWay,
    hasResend: details.hasResend,
  };
}

async function doGoogleLogin(page, email, password) {
  await debugState(page, 'youtube-home');

  const signInLink = await findFirstVisible(page, [
    'a[aria-label*="sign in"i]',
    'a[aria-label*="đăng nhập"i]',
    'ytd-button-renderer a[href*="accounts.google.com"]',
    'a[href*="ServiceLogin"]',
  ], 10000);

  if (!signInLink) {
    log.warn('No Sign In button found on YouTube');
    return false;
  }

  log.info(`[step] sign-in selector=${signInLink.selector}`);
  const clicked = await clickAndTrack(page, signInLink.locator, 'sign-in-clicked', 4000);
  if (!clicked) return false;

  const emailInput = await waitVisible(page, 'input[type="email"], #identifierId', 15000);
  if (emailInput) {
    log.info('[step] filling-email');
    await fillAndWait(emailInput, email, 800);
    await debugState(page, 'email-filled');

    const nextBtn = await findFirstVisible(page, [
      '#identifierNext button',
      '#identifierNext div[role="button"]',
      'button:has-text("Next")',
      'button:has-text("Tiếp theo")',
      'div[role="button"]:has-text("Next")',
      'div[role="button"]:has-text("Tiếp theo")',
    ], 10000);

    if (!nextBtn) {
      log.warn('Email Next button not found');
      return false;
    }

    await clickAndTrack(page, nextBtn.locator, 'email-next', 4000);
  } else {
    log.info('[step] no email input shown; checking account chooser flow');
    await debugState(page, 'email-missing');
  }

  const pwStepOk = await continueFromAccountChooser(page, password);
  if (!pwStepOk) {
    await debugState(page, 'password-missing');
    return false;
  }

  log.info('[step] waiting-for-youtube-redirect');
  for (let i = 0; i < 30; i += 1) {
    const url = page.url();
    log.info(`[step] redirect-poll index=${i} url=${url}`);
    if (url.includes('youtube.com') && !url.includes('accounts.google.com')) {
      log.info('Redirected to YouTube after login');
      break;
    }
    await sleep(2000);
  }

  await debugState(page, 'post-login');
  const signedIn = await isSignedIn(page);
  if (signedIn) {
    log.info('✅ Google / YouTube login successful!');
  } else {
    const googlePrompt = await detectGooglePromptChallenge(page);
    if (googlePrompt) {
      log.warn(
        `⛔ Google Prompt required on ${googlePrompt.deviceName}. heading=${googlePrompt.heading} tryAnotherWay=${googlePrompt.hasTryAnotherWay} resend=${googlePrompt.hasResend} url=${googlePrompt.url}`,
      );
      if (googlePrompt.body) {
        log.warn(`[google-prompt] ${googlePrompt.body}`);
      }
    } else {
      log.warn('⛔ Login may have failed or encountered additional verification');
    }
  }
  return signedIn;
}

async function main() {
  const email = process.env.GMAIL_USER;
  const password = process.env.GMAIL_PASS;

  if (!email || !password) {
    log.error('GMAIL_USER and GMAIL_PASS env vars required');
    process.exit(1);
  }

  try {
    if (!fs.existsSync(PROFILE)) {
      fs.mkdirSync(PROFILE, { recursive: true });
      log.info(`Created profile directory: ${PROFILE}`);
    }
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
  } catch {
    // best effort only
  }

  log.info(`Chromium binary: ${CHROME_BIN}`);
  log.info(`Profile: ${PROFILE}`);
  log.info(`Headless: ${HEADLESS}`);
  log.info(`Debug dir: ${DEBUG_DIR}`);

  let context;

  try {
    context = await chromium.launchPersistentContext(PROFILE, {
      executablePath: CHROME_BIN,
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-setuid-sandbox',
        '--no-first-run',
        '--disable-blink-features=AutomationControlled',
      ],
      timeout: TIMEOUT,
      locale: 'en-US',
      timezoneId: 'Asia/Ho_Chi_Minh',
      viewport: { width: 1280, height: 720 },
    });

    const pages = context.pages();
    const page = pages.length > 0 ? pages[0] : await context.newPage();
    page.setDefaultTimeout(15000);

    log.info('Navigating to https://www.youtube.com...');
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await debugState(page, 'after-youtube-goto');

    const signedIn = await isSignedIn(page);
    if (signedIn) {
      log.info('✅ Already signed in to YouTube — no action needed');
      await context.close();
      process.exit(0);
    }

    log.info('Not signed in — starting Google SSO flow...');
    const success = await doGoogleLogin(page, email, password);

    await sleep(2000);
    await context.close();

    if (success) {
      log.info('✅ Playwright auth refresh complete');
      process.exit(0);
    }

    log.error('❌ Playwright auth refresh failed');
    process.exit(2);
  } catch (err) {
    log.error('Fatal error:', err.message || err);
    try {
      if (context) await context.close();
    } catch {}
    process.exit(3);
  }
}

main();
