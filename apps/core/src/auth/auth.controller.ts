import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { sign } from 'jsonwebtoken';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ThrottleGuard } from '../common/guards/throttle.guard';
import { PrismaService } from '../common/database/prisma.service';

// 20 requests per minute for auth endpoints
const authThrottleGuard = new ThrottleGuard(20, 60000);

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const candidate = createHash('sha256').update(salt + password).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  } catch {
    return false;
  }
}

@Controller('auth')
@UseGuards(authThrottleGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  async register(@Body() body: { email: string; name: string; password: string }) {
    if (!body.email || !body.password || !body.name) {
      throw new HttpException('Email, name, and password are required', HttpStatus.BAD_REQUEST);
    }
    if (body.password.length < 8) {
      throw new HttpException('Password must be at least 8 characters', HttpStatus.BAD_REQUEST);
    }

    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new HttpException('Email already registered', HttpStatus.CONFLICT);
    }

    const user = await this.prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: hashPassword(body.password),
        authProvider: 'credentials',
        role: 'member',
      },
    });

    this.logger.log(`User registered: ${user.email}`);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    if (!body.email || !body.password) {
      throw new HttpException('Email and password are required', HttpStatus.BAD_REQUEST);
    }

    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.passwordHash) {
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }

    if (!verifyPassword(body.password, user.passwordHash)) {
      throw new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    }

    const token = sign(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      this.configService.get<string>('jwt.secret', 'change-me-in-production'),
      { expiresIn: '7d' },
    );

    this.logger.log(`User logged in: ${user.email}`);

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Initiates Google OAuth flow
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as { id: string; email: string; name: string; role: string };

    const token = sign(
      { sub: user.id, email: user.email },
      this.configService.get<string>('jwt.secret', 'change-me-in-production'),
      { expiresIn: '7d' },
    );

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );

    res.redirect(`${frontendUrl}/auth/callback?token=${token}`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    return req.user;
  }
}
