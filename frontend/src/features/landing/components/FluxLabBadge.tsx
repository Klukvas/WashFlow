import './flux-lab-badge.css';

export function FluxLabBadge() {
  return (
    <a
      href="https://flux-lab.dev/"
      className="powered-by"
      target="_blank"
      rel="noopener"
    >
      <div className="powered-by__icon">
        <svg width="13" height="11" viewBox="0 0 62 52" fill="none">
          <g className="l1">
            <polygon
              points="31,3 57,15 31,27 5,15"
              fill="white"
              opacity=".92"
            />
          </g>
          <g className="l2">
            <line
              x1="5" y1="25" x2="31" y2="36"
              stroke="#9E94F9" strokeWidth="3" strokeLinecap="round" opacity=".68"
            />
            <line
              x1="31" y1="36" x2="57" y2="25"
              stroke="#9E94F9" strokeWidth="3" strokeLinecap="round" opacity=".68"
            />
          </g>
          <g className="l3">
            <line
              x1="5" y1="35" x2="31" y2="47"
              stroke="#7B6EF6" strokeWidth="4" strokeLinecap="round"
            />
            <line
              x1="31" y1="47" x2="57" y2="35"
              stroke="#7B6EF6" strokeWidth="4" strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <div className="powered-by__text">
        <span className="powered-by__label">powered by</span>
        <span className="powered-by__brand">flux-lab</span>
        <span className="powered-by__tld">.dev</span>
      </div>
    </a>
  );
}
