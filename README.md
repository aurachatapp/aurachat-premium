# AuraChat Premium

Stripe-powered premium system for the AuraChat Chrome extension.

## How to use
- `backend/` → runs the Stripe server (subscription check + webhooks).
- `upgrade-page/` → host this HTML page (GitHub Pages or Netlify).
- `extension/` → load this folder into Chrome via chrome://extensions.

## Backend quick start
1. Go into `backend/`
2. Copy `.env.example` → `.env` and fill in your Stripe keys
3. Run `npm install`
4. Run `npm start`
5. Deploy to Render/Railway later

## Extension quick start
1. Go to `chrome://extensions`
2. Enable developer mode
3. Click "Load unpacked"
4. Select the `extension/` folder
