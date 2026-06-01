import { Router } from 'express';
import { hash, compare } from 'bcryptjs';
import prisma from '../prisma';
import { generateToken } from '../middleware/auth';

const router = Router();

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    const token = generateToken(user.id, user.email);
    return res.status(201).json({ user: { id: user.id, email: user.email }, token });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.id, user.email);
    return res.json({ user: { id: user.id, email: user.email }, token });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
