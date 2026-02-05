# SecureChat Client

End-to-end encrypted messaging Progressive Web App built with Next.js.

## Features

- **End-to-End Encryption**: Messages encrypted with X25519 + AES-256-GCM using Web Crypto API
- **Progressive Web App**: Install on any device, works offline
- **OAuth2 PKCE**: Secure authentication flow with identity.harker.dev
- **Real-time Messaging**: Fast message delivery with Orleans backend
- **Modern UI**: Responsive design with Tailwind CSS

## Tech Stack

- **Next.js 15**: React framework with static export
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Web Crypto API**: Browser-native cryptography
- **PWA**: Service worker for offline support

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- SecureChat backend API running

### Installation

1. **Clone and navigate to client directory**:
   ```bash
   cd securechat-client
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your settings:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000
   NEXT_PUBLIC_AUTH_AUTHORITY=https://identity.harker.dev
   NEXT_PUBLIC_AUTH_CLIENT_ID=securechat-web
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run build
```

This creates a static export in the `out/` directory that can be deployed to any static hosting service.

### Deploy

The static build can be deployed to:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Any static file server

## Project Structure

```
securechat-client/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with AuthProvider
│   ├── page.tsx           # Home page (landing/chat switcher)
│   └── auth/callback/     # OAuth callback handler
├── components/            # React components
│   ├── LandingPage.tsx   # Landing page with login
│   ├── ChatInterface.tsx # Main chat interface
│   ├── ConversationList.tsx
│   └── MessageView.tsx   # Message display and sending
├── contexts/             # React contexts
│   └── AuthContext.tsx  # Authentication state management
├── lib/                 # Utilities and libraries
│   ├── crypto.ts       # Web Crypto API encryption utilities
│   ├── auth.ts         # OAuth2 PKCE authentication
│   └── api-client.ts   # Backend API client
└── public/             # Static assets
    └── manifest.json   # PWA manifest
```

## Security

### Client-Side Encryption

All messages are encrypted on the client before being sent to the server:

1. **Key Generation**: X25519 identity keys generated using Web Crypto API
2. **Key Exchange**: ECDH key agreement with recipient's public key
3. **Message Encryption**: AES-256-GCM with per-message nonces
4. **Key Storage**: Private keys encrypted with password-derived KEK (PBKDF2)
5. **IndexedDB**: Encrypted keys stored locally

### Authentication

- OAuth2 PKCE flow prevents authorization code interception
- No client secret required (public client)
- Tokens stored in localStorage (consider secure cookies for production)
- Automatic token refresh

## Development

### Code Style

```bash
npm run lint
```

### Type Checking

```bash
npx tsc --noEmit
```

## TODO/Future Enhancements

- [ ] Implement full E2E encryption in MessageView
- [ ] Add conversation key management UI
- [ ] Real-time message updates (WebSocket/SignalR)
- [ ] File attachment support
- [ ] Message search (client-side decryption)
- [ ] Push notifications
- [ ] Group conversation management UI
- [ ] User profile management
- [ ] Dark mode toggle
- [ ] Message reactions and threading UI

## Troubleshooting

### Build Errors

If you see TypeScript errors, ensure all dependencies are installed:
```bash
rm -rf node_modules package-lock.json
npm install
```

### PWA Not Working

PWA features are disabled in development mode. Build and serve the production build:
```bash
npm run build
npx serve@latest out
```

### Authentication Issues

1. Verify `NEXT_PUBLIC_AUTH_AUTHORITY` matches your OAuth provider
2. Ensure callback URL is registered: `http://localhost:3000/auth/callback`
3. Check browser console for detailed error messages

## License

MIT License - See parent project for details
