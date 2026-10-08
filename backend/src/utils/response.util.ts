import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response, 
  data: T, 
  message?: string, 
  statusCode: number = 200, 
  meta?: Record<string, unknown>
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
    timestamp: new Date().toISOString(),
    ...(meta && { meta })
  };
  return res.status(statusCode).json(response);
}

export function sendError(
  res: Response, 
  errorMessage: string, 
  statusCode: number = 400, 
  meta?: Record<string, unknown>
): Response {
  const response: ApiResponse = {
    success: false,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    ...(meta && { meta })
  };
  return res.status(statusCode).json(response);
}
