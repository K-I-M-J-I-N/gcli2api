/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import notifier from 'node-notifier';
import type { Config } from '../config/config.js';
import { exec } from 'node:child_process';

/**
 * Service for sending OS-level notifications.
 */
export class NotificationService {
  private static config: Config | undefined;

  /**
   * Initialize the service with current configuration.
   */
  static init(config: Config): void {
    this.config = config;
  }

  /**
   * Send a notification to the user.
   */
  static notify(title: string, message: string): void {
    const enabled = this.config?.isNotificationsEnabled() ?? true;
    if (!enabled || process.platform !== 'win32' || !message.trim()) {
      return;
    }
    // Try node-notifier first
    try {
      notifier.notify(
        {
          title,
          message,
          sound: true,
          wait: false,
        },
        (err) => {
          if (err) {
            // If node-notifier fails, fallback to PowerShell
            this.fallbackNotify(title, message);
          }
        },
      );
    } catch (_e) {
      this.fallbackNotify(title, message);
    }
  }

  /**
   * Fallback using PowerShell directly to ensure delivery even if bundling fails.
   */
  private static fallbackNotify(title: string, message: string): void {
    const escapedTitle = title.replace(/'/g, "''");
    const escapedMessage = message.replace(/'/g, "''");

    // Windows Toast notification via PowerShell
    // Note: MessageBox is blocking, so we'd prefer a real toast,
    // but for simple "Task Completed" it's a very reliable fallback.
    // Let's use a non-blocking BurntToast style if possible, or just a simple balloon tip.
    const balloonCommand = `powershell.exe -NoProfile -Command "$val = '[reflection.assembly]::loadwithpartialname(\\"System.Windows.Forms\\")'; [void](iex $val); $t = New-Object System.Windows.Forms.NotifyIcon; $t.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Get-Process -Id $PID).Path); $t.Visible = $true; $t.ShowBalloonTip(5000, '${escapedTitle}', '${escapedMessage}', [System.Windows.Forms.ToolTipIcon]::Info); Start-Sleep -s 5; $t.Dispose()"`;

    exec(balloonCommand, (error) => {
      if (error) {
        // Last resort: simple console beep or log
      }
    });
  }

  static notifyInputRequired(): void {
    this.notify('Gemini CLI', '사용자 입력이 필요합니다!');
  }

  static notifyTaskCompleted(message?: string): void {
    this.notify('Gemini CLI', message || '작업이 완료되었습니다.');
  }
}
