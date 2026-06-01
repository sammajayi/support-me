import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as {
      id: number;
      email: string;
    };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const generateToken = (userId: number, email: string): string => {
  return jwt.sign(
    { id: userId, email },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};
