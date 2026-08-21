const rayPaths = [
  'M887.188 293.598C887.188 293.598 716.633 300.313 651.723 270.768C586.813 241.223 504.238 187.952 504.238 187.952',
  'M887.191 293.598L768.115 25.0063',
  'M887.191 293.598L636.505 119.909',
  'M886.951 309.469C886.951 309.469 716.395 302.755 651.485 332.3C586.576 361.845 504 415.116 504 415.116',
  'M886.951 309.47L767.875 578.061',
  'M886.951 309.47L636.265 483.159',
] as const;

const AppLoadingMark = () => (
  <div className="nodu-app-loading" role="status" aria-label="Připravuji aplikaci">
    <svg
      className="nodu-app-loading__mark"
      viewBox="470 0 500 600"
      fill="none"
      aria-hidden="true"
    >
      {rayPaths.map((path, index) => (
        <g
          key={path}
          className={`nodu-app-loading__ray nodu-app-loading__ray--${index + 1}`}
        >
          <path d={path} />
        </g>
      ))}
      <path
        className="nodu-app-loading__dot"
        d="M867.495 231.427C906.281 231.427 937.723 262.87 937.723 301.656C937.723 340.442 906.281 371.884 867.495 371.885C828.708 371.885 797.265 340.442 797.265 301.656C797.265 262.87 828.708 231.427 867.495 231.427Z"
      />
    </svg>
  </div>
);

export default AppLoadingMark;
