import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { sign } from 'jsonwebtoken';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ThrottleGuard } from '../common/guards/throttle.guard';

// 20 requests per minute for auth endpoints
const authThrottleGuard = new ThrottleGuard(20, 60000);

@Controller('auth')
@UseGuards(authThrottleGuard)
export class AuthController {
  constructor(private readonly configService: ConfigService) {}

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
