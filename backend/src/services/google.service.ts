import {
  OAuth2Client,
} from "google-auth-library";

import jwt from "jsonwebtoken";

import { prisma } from "../config/prisma";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
];

function createGoogleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri
  ) {
    throw new Error(
      "Google OAuth environment variables are missing"
    );
  }

  return new OAuth2Client(
    clientId,
    clientSecret,
    redirectUri
  );
}

export function getGoogleAuthorizeUrl(
  state: string
): string {
  const client = createGoogleClient();

  return client.generateAuthUrl({
    access_type: "online",
    scope: GOOGLE_SCOPES,
    state,
    prompt: "select_account",
  });
}

export async function handleGoogleCallback(
  code: string
) {
  const client = createGoogleClient();

  const { tokens } =
    await client.getToken(code);

  if (!tokens.id_token) {
    throw new Error(
      "Google did not return an ID token"
    );
  }

  const ticket =
    await client.verifyIdToken({
      idToken: tokens.id_token,
      audience:
        process.env.GOOGLE_CLIENT_ID,
    });

  const payload =
    ticket.getPayload();

  if (!payload) {
    throw new Error(
      "Unable to read Google profile"
    );
  }

  if (
    !payload.sub ||
    !payload.email
  ) {
    throw new Error(
      "Google account information is incomplete"
    );
  }

  const googleId = payload.sub;
  const email = payload.email;

  const name =
    payload.name ||
    email.split("@")[0];

  const avatar =
    payload.picture || null;

  const user =
    await prisma.user.upsert({
      where: {
        email,
      },

      create: {
        googleId,
        name,
        email,
        avatar,
      },

      update: {
        googleId,
        name,
        avatar,
      },
    });

  const jwtSecret =
    process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error(
      "JWT_SECRET is not configured"
    );
  }

  const appToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    jwtSecret,
    {
      expiresIn: "7d",
    }
  );

  return {
    user,
    token: appToken,
  };
}