import {
  NextFunction,
  Request,
  Response,
} from "express";

import jwt from "jsonwebtoken";

export interface AuthenticatedRequest
  extends Request {
  userId?: string;
}

function getToken(
  req: AuthenticatedRequest
): string | null {
  // -----------------------------------------
  // First check HttpOnly cookie
  // -----------------------------------------

  const cookieToken =
    req.cookies?.reachinbox_token;

  if (cookieToken) {
    return cookieToken;
  }

  // -----------------------------------------
  // Also support Authorization header
  // This keeps backend compatibility.
  // -----------------------------------------

  const authHeader =
    req.headers.authorization;

  if (
    authHeader &&
    authHeader.startsWith("Bearer ")
  ) {
    return authHeader.substring(7);
  }

  return null;
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const secret =
      process.env.JWT_SECRET;

    if (!secret) {
      throw new Error(
        "JWT_SECRET is not configured"
      );
    }

    const payload =
      jwt.verify(
        token,
        secret
      ) as {
        userId: string;
        email?: string;
      };

    if (!payload.userId) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid authentication token",
      });
    }

    req.userId =
      payload.userId;

    next();
  } catch (error) {
    console.error(
      "Authentication error:",
      error
    );

    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired token",
    });
  }
}
