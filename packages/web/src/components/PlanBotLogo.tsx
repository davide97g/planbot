interface PlanBotLogoProps {
  className?: string;
}

export function PlanBotLogo({ className = "size-6" }: PlanBotLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient
          id="pb-g1"
          x1="0"
          y1="0"
          x2="512"
          y2="512"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient
          id="pb-g2"
          x1="128"
          y1="160"
          x2="384"
          y2="400"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <rect x="32" y="32" width="448" height="448" rx="96" fill="url(#pb-g1)" />
      <rect x="136" y="140" width="240" height="200" rx="40" fill="white" opacity="0.95" />
      <circle cx="210" cy="230" r="24" fill="url(#pb-g2)" />
      <circle cx="302" cy="230" r="24" fill="url(#pb-g2)" />
      <circle cx="200" cy="222" r="7" fill="white" />
      <circle cx="292" cy="222" r="7" fill="white" />
      <rect x="184" y="282" width="144" height="10" rx="5" fill="url(#pb-g2)" opacity="0.7" />
      <rect x="196" y="300" width="120" height="10" rx="5" fill="url(#pb-g2)" opacity="0.5" />
      <rect x="208" y="318" width="96" height="10" rx="5" fill="url(#pb-g2)" opacity="0.3" />
      <line x1="256" y1="140" x2="256" y2="100" stroke="white" strokeWidth="10" strokeLinecap="round" opacity="0.9" />
      <circle cx="256" cy="88" r="16" fill="white" opacity="0.9" />
      <circle cx="256" cy="88" r="8" fill="url(#pb-g2)" />
      <circle cx="124" cy="230" r="18" fill="white" opacity="0.85" />
      <circle cx="124" cy="230" r="8" fill="url(#pb-g2)" opacity="0.6" />
      <circle cx="388" cy="230" r="18" fill="white" opacity="0.85" />
      <circle cx="388" cy="230" r="8" fill="url(#pb-g2)" opacity="0.6" />
      <rect x="192" y="340" width="128" height="48" rx="16" fill="white" opacity="0.5" />
      <rect x="200" y="380" width="40" height="24" rx="12" fill="white" opacity="0.6" />
      <rect x="272" y="380" width="40" height="24" rx="12" fill="white" opacity="0.6" />
    </svg>
  );
}
