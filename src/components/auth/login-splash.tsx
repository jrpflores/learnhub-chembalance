"use client";

import { BrandLogo } from "@/components/layout/brand-logo";

type LoginSplashProps = {
  open: boolean;
  logoUrl: string;
  title?: string;
};

export function LoginSplash({ open, logoUrl, title = "ChemBalance" }: LoginSplashProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="login-splash" role="status" aria-live="polite" aria-label={`${title} loading`}>
      <div className="login-splash__glow" aria-hidden="true" />
      <div className="login-splash__content">
        <div className="login-splash__logo">
          <BrandLogo size={132} alt={`${title} logo`} src={logoUrl} loading="eager" className="login-splash__logo-img" />
        </div>
        <h1 className="login-splash__title">{title}</h1>
        <p className="login-splash__subtitle">Preparing your workspace</p>
        <div className="login-splash__bar" aria-hidden="true">
          <span className="login-splash__bar-fill" />
        </div>
      </div>
    </div>
  );
}
