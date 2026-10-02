'use strict';

// SF-Symbol-inspired stroke icons (24x24, rounded caps) rendered as inline SVG.
// Each entry is the *inner* markup of an <svg>; wrap with window.iconSvg(name).
(function () {
  const ICONS = {
    code: '<path d="M8 9l-3 3 3 3"/><path d="M16 9l3 3-3 3"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="16.6" y1="16.6" x2="21" y2="21"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    folderPlus:
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    file: '<path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M13 3v5h5"/>',
    filePlus:
      '<path d="M6 3h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M13 3v5h5"/><line x1="12" y1="13" x2="12" y2="19"/><line x1="9" y1="16" x2="15" y2="16"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    gear:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.3 1a8.5 8.5 0 0 0-2.6-1.5L14 3h-4l-.5 2.6a8.5 8.5 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.4 2.3-1a8.5 8.5 0 0 0 2.6 1.5L10 21h4l.5-2.6a8.5 8.5 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5Z"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><line x1="9" y1="4" x2="9" y2="20"/>',
    grid:
      '<rect x="3" y="3" width="7" height="7" rx="1.8"/><rect x="14" y="3" width="7" height="7" rx="1.8"/><rect x="3" y="14" width="7" height="7" rx="1.8"/><rect x="14" y="14" width="7" height="7" rx="1.8"/>',
    list:
      '<line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
    sort:
      '<path d="M8 7l4-4 4 4"/><line x1="12" y1="3" x2="12" y2="21"/><path d="M8 17l4 4 4-4"/>',
    external:
      '<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M15 9l-6 6"/><path d="M9 9h6v6"/>',
    terminal: '<polyline points="4 17 10 12 4 7"/><line x1="12" y1="19" x2="20" y2="19"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 8 16 8"/>',
    chevronLeft: '<polyline points="14.5 5 8 12 14.5 19"/>',
    chevronRight: '<polyline points="9.5 5 16 12 9.5 19"/>',
    chevronDown: '<polyline points="5 9.5 12 16 19 9.5"/>',
    xmark: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
    restore:
      '<rect x="8" y="8" width="11" height="11" rx="2.5"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
    squareMax: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
    star: '<path d="M12 3.6l2.5 5.1 5.6.8-4 4 .95 5.6L12 16.4 6.95 19.1 7.9 13.5 3.9 9.5l5.6-.8z"/>',
    starFill: '<path d="M12 3.6l2.5 5.1 5.6.8-4 4 .95 5.6L12 16.4 6.95 19.1 7.9 13.5 3.9 9.5l5.6-.8z" fill="currentColor" stroke="none"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    info:
      '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
    dots:
      '<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    sparkle:
      '<path d="M12 3l1.8 4.6L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.9L12 3Z"/><path d="M19 15l.7 1.8L21.5 17.5l-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7L19 15Z"/>',
    trash:
      '<path d="M4 7h16"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
    pencil: '<path d="M4 20h4l10-10a2 2 0 0 0-3-3L5 17v3Z"/><path d="M14.5 6.5 17.5 9.5"/>',
    folderMove: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 13h6"/><path d="M13 11l2 2-2 2"/>',
    funnel: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    play: '<path d="M7 5.5v13l11-6.5z"/>',
    gitBranch:
      '<circle cx="6.5" cy="6" r="2.2"/><circle cx="6.5" cy="18" r="2.2"/><circle cx="17.5" cy="8" r="2.2"/><path d="M6.5 8.2v7.6"/><path d="M17.5 10.2c0 3.4-3 4.3-6 4.6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    tag: '<path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5 12.5 20 3 12.5Z"/><circle cx="7.6" cy="7.6" r="1.3" fill="currentColor" stroke="none"/>',
    check: '<polyline points="5 13 10 18 19 6.5"/>',
    pause: '<rect x="7" y="5" width="3.4" height="14" rx="1.2"/><rect x="13.6" y="5" width="3.4" height="14" rx="1.2"/>',
    archive:
      '<rect x="3" y="4" width="18" height="4" rx="1.5"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/>',
    alert:
      '<path d="M12 4.5 21 19H3z"/><line x1="12" y1="10" x2="12" y2="14.5"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/>',
    gauge:
      '<path d="M4.5 19a8.5 8.5 0 1 1 15 0"/><path d="M12 19l4-5.2"/><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/>'
  };

  window.ICONS = ICONS;

  window.iconSvg = function (name, className) {
    const inner = ICONS[name] || '';
    return (
      '<svg class="' + (className || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner +
      '</svg>'
    );
  };

  // Pastel palette + monogram for each detected stack key.
  window.STACKS = {
    javascript: { label: 'JavaScript', bg: '#fef3c7', fg: '#b45309', mono: 'JS' },
    typescript: { label: 'TypeScript', bg: '#dbeafe', fg: '#1d4ed8', mono: 'TS' },
    node: { label: 'Node.js', bg: '#ecfccb', fg: '#3f6212', mono: 'N' },
    python: { label: 'Python', bg: '#e0f2fe', fg: '#0369a1', mono: 'Py' },
    rust: { label: 'Rust', bg: '#fed7aa', fg: '#9a3412', mono: 'Rs' },
    go: { label: 'Go', bg: '#cffafe', fg: '#0e7490', mono: 'Go' },
    java: { label: 'Java', bg: '#fee2e2', fg: '#b91c1c', mono: 'Jv' },
    kotlin: { label: 'Kotlin', bg: '#ede9fe', fg: '#6d28d9', mono: 'Kt' },
    csharp: { label: 'C#', bg: '#dbeafe', fg: '#1e40af', mono: 'C#' },
    cpp: { label: 'C/C++', bg: '#dbeafe', fg: '#1e3a8a', mono: 'C' },
    c: { label: 'C', bg: '#e0e7ff', fg: '#3730a3', mono: 'C' },
    ruby: { label: 'Ruby', bg: '#fee2e2', fg: '#b91c1c', mono: 'Rb' },
    php: { label: 'PHP', bg: '#ede9fe', fg: '#5b21b6', mono: 'PHP' },
    swift: { label: 'Swift', bg: '#fef3c7', fg: '#b45309', mono: 'Sw' },
    dart: { label: 'Dart', bg: '#dbeafe', fg: '#1d4ed8', mono: 'Dr' },
    flutter: { label: 'Flutter', bg: '#cffafe', fg: '#0e7490', mono: 'Fl' },
    elixir: { label: 'Elixir', bg: '#ede9fe', fg: '#6d28d9', mono: 'Ex' },
    react: { label: 'React', bg: '#cffafe', fg: '#0e7490', mono: 'R' },
    vue: { label: 'Vue', bg: '#dcfce7', fg: '#15803d', mono: 'V' },
    angular: { label: 'Angular', bg: '#fee2e2', fg: '#b91c1c', mono: 'A' },
    svelte: { label: 'Svelte', bg: '#fee2e2', fg: '#b91c1c', mono: 'S' },
    nextjs: { label: 'Next.js', bg: '#f1f5f9', fg: '#334155', mono: 'Nx' },
    nuxt: { label: 'Nuxt', bg: '#dcfce7', fg: '#15803d', mono: 'Nu' },
    nestjs: { label: 'NestJS', bg: '#fee2e2', fg: '#b91c1c', mono: 'Ne' },
    express: { label: 'Express', bg: '#f1f5f9', fg: '#334155', mono: 'Ex' },
    electron: { label: 'Electron', bg: '#dbeafe', fg: '#1e40af', mono: 'E' },
    tailwind: { label: 'Tailwind', bg: '#cffafe', fg: '#0e7490', mono: 'Tw' },
    vite: { label: 'Vite', bg: '#fef9c3', fg: '#a16207', mono: 'Vt' },
    webpack: { label: 'Webpack', bg: '#dbeafe', fg: '#1e40af', mono: 'Wp' },
    gatsby: { label: 'Gatsby', bg: '#ede9fe', fg: '#6d28d9', mono: 'G' },
    remix: { label: 'Remix', bg: '#f1f5f9', fg: '#334155', mono: 'Rx' },
    astro: { label: 'Astro', bg: '#fee2e2', fg: '#b91c1c', mono: 'As' },
    redux: { label: 'Redux', bg: '#ede9fe', fg: '#6d28d9', mono: 'Rd' },
    graphql: { label: 'GraphQL', bg: '#fce7f3', fg: '#be185d', mono: 'GQ' },
    prisma: { label: 'Prisma', bg: '#f1f5f9', fg: '#334155', mono: 'Pr' },
    threejs: { label: 'Three.js', bg: '#f1f5f9', fg: '#334155', mono: '3D' },
    d3: { label: 'D3', bg: '#fee2e2', fg: '#b91c1c', mono: 'D3' },
    django: { label: 'Django', bg: '#dcfce7', fg: '#15803d', mono: 'Dj' },
    flask: { label: 'Flask', bg: '#f1f5f9', fg: '#334155', mono: 'Fl' },
    fastapi: { label: 'FastAPI', bg: '#dcfce7', fg: '#15803d', mono: 'Fa' },
    pytest: { label: 'Pytest', bg: '#dbeafe', fg: '#1e40af', mono: 'Py' },
    gradle: { label: 'Gradle', bg: '#cffafe', fg: '#0e7490', mono: 'Gd' },
    docker: { label: 'Docker', bg: '#dbeafe', fg: '#1d4ed8', mono: 'Dk' },
    git: { label: 'Git', bg: '#fee2e2', fg: '#b91c1c', mono: 'Gt' },
    github: { label: 'GitHub', bg: '#f1f5f9', fg: '#334155', mono: 'GH' },
    html: { label: 'HTML', bg: '#fee2e2', fg: '#b91c1c', mono: 'H5' },
    css: { label: 'CSS', bg: '#dbeafe', fg: '#1d4ed8', mono: 'C3' },
    shell: { label: 'Shell', bg: '#f1f5f9', fg: '#334155', mono: 'Sh' },
    sql: { label: 'SQL', bg: '#fef9c3', fg: '#a16207', mono: 'SQL' }
  };

  // Brand marks (fill-based SVGs) for the most recognizable stacks.
  var BRAND_ICONS = {
    javascript: '<rect width="24" height="24" rx="5" fill="#F7DF1E"/><text x="12" y="16.2" text-anchor="middle" font-family="Segoe UI, -apple-system, system-ui, sans-serif" font-size="9.5" font-weight="800" fill="#000">JS</text>',
    typescript: '<rect width="24" height="24" rx="5" fill="#3178C6"/><text x="12" y="16.2" text-anchor="middle" font-family="Segoe UI, -apple-system, system-ui, sans-serif" font-size="9.5" font-weight="800" fill="#fff">TS</text>',
    node: '<path d="M12 2 20.7 7v10L12 22 3.3 17V7z" fill="#339933"/><text x="12" y="15.6" text-anchor="middle" font-family="Segoe UI, -apple-system, system-ui, sans-serif" font-size="7.5" font-weight="800" fill="#fff">JS</text>',
    nextjs: '<circle cx="12" cy="12" r="11" fill="#000"/><text x="12" y="16.6" text-anchor="middle" font-family="Segoe UI, -apple-system, system-ui, sans-serif" font-size="11" font-weight="800" fill="#fff">N</text>',
    react: '<circle cx="12" cy="12" r="2.1" fill="#61DAFB"/><g stroke="#61DAFB" stroke-width="1.2" fill="none"><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/></g>',
    vue: '<path d="M12 3 2 20h4.3L12 9.8 17.7 20H22z" fill="#41B883"/><path d="M12 3 6.5 12.6 12 22l5.5-9.4z" fill="#35495E"/>',
    angular: '<path d="M12 3 3 6.2l1.4 11.5L12 21l7.6-3.3L21 6.2z" fill="#DD0031"/><path d="M12 3 3 6.2l1.4 11.5L12 21z" fill="#C3002F"/><path d="M12 6.3 8.1 15h2.3l1.6-3.8 1.6 3.8h2.3z" fill="#fff"/>',
    tailwind: '<rect width="24" height="24" rx="5" fill="#0EA5E9"/><path d="M12 7c-1.8 0-2.9.9-3.2 2.7.6-.9 1.4-1.2 2.2-1 .5.1.9.4 1.3.8.7.7 1.4 1.4 2.9 1.4 1.8 0 2.9-.9 3.2-2.7-.6.9-1.4 1.2-2.2 1-.5-.1-.9-.4-1.3-.8-.7-.7-1.4-1.4-2.9-1.4zM8 12c-1.8 0-2.9.9-3.2 2.7.6-.9 1.4-1.2 2.2-1 .5.1.9.4 1.3.8.7.7 1.4 1.4 2.9 1.4 1.8 0 2.9-.9 3.2-2.7-.6.9-1.4 1.2-2.2 1-.5-.1-.9-.4-1.3-.8-.7-.7-1.4-1.4-2.9-1.4z" fill="#fff"/>',
    git: '<rect width="24" height="24" rx="5" fill="#F05033"/><g stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="5.5" r="1.7" fill="#fff"/><circle cx="7" cy="18.5" r="1.7" fill="#fff"/><circle cx="17" cy="6.5" r="1.7" fill="#fff"/><path d="M7 7.2v9.6"/><path d="M7 8c4 0 8-.6 9.9-1.5"/></g>',
    python: '<path d="M11.8 2C7.2 2 6.9 4 6.9 4v2.4h5.1v.8H4.4S2.3 6.7 2.3 11.2s2.1 4.4 2.1 4.4H6v-2s0-2.3 2.3-2.3h3.6s2.2 0 2.2-2.2V5.2S14.5 2 11.8 2zM9.7 3.2c.4 0 .7.4.7.8s-.3.7-.7.7-.7-.3-.7-.7.3-.8.7-.8z" fill="#387EB8"/><path d="M12.2 22c4.6 0 4.9-2 4.9-2v-2.4H12v-.8h7.6s2.1.5 2.1-4-2.1-4.4-2.1-4.4H18v2s0 2.3-2.3 2.3h-3.6s-2.2 0-2.2 2.2V16S9.5 22 12.2 22zM14.3 20.8c-.4 0-.7-.4-.7-.8s.3-.7.7-.7.7.3.7.7-.3.8-.7.8z" fill="#FFE873"/>',
    rust: '<circle cx="12" cy="12" r="8.5" fill="#000"/><circle cx="12" cy="12" r="3" fill="#fff"/><g stroke="#000" stroke-width="1.1" fill="none"><path d="M12 2v2.6"/><path d="M12 19.4V22"/><path d="M2 12h2.6"/><path d="M19.4 12H22"/><path d="M4.9 4.9l1.8 1.8"/><path d="M17.3 17.3l1.8 1.8"/><path d="M19.1 4.9l-1.8 1.8"/><path d="M6.7 17.3l-1.8 1.8"/></g>',
    docker: '<rect width="24" height="24" rx="5" fill="#2496ED"/><g fill="#fff"><rect x="6" y="6" width="4" height="2.4" rx="0.6"/><rect x="10.7" y="6" width="4" height="2.4" rx="0.6"/><rect x="15.4" y="6" width="2.8" height="2.4" rx="0.6"/><rect x="6" y="10" width="4" height="2.4" rx="0.6"/><rect x="10.7" y="10" width="4" height="2.4" rx="0.6"/><rect x="15.4" y="10" width="2.8" height="2.4" rx="0.6"/><path d="M6 15h12c0 1.7-1.3 3-3 3H9c-1.7 0-3-1.3-3-3z"/></g>',
    html: '<path d="M4 3h16l-1.4 15.5L12 21l-6.6-2.5z" fill="#E44D26"/><path d="M12 5v13.6l4.8-1.8L17.9 5z" fill="#F16529"/><path d="M8.4 8h7.2l-.3 3H8.4l.3 3.2h6l-.4 4-2.3.7-2.3-.7-.1-1.5H8.5l.3 3.4 3.2 1.3 3.2-1.3.6-6.3H8.7z" fill="#fff"/>',
    css: '<path d="M4 3h16l-1.4 15.5L12 21l-6.6-2.5z" fill="#264DE4"/><path d="M12 5v13.6l4.8-1.8L17.9 5z" fill="#2965F1"/><g fill="#fff"><rect x="8.2" y="7" width="7.6" height="1.6"/><rect x="8.2" y="10" width="7.6" height="1.6"/><rect x="9.5" y="13" width="2.5" height="1.6"/></g>',
    sql: '<ellipse cx="12" cy="5.5" rx="8" ry="3.2" fill="#336791"/><path d="M4 5.5v11c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-11" fill="#336791"/><path d="M4 11c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="1.5"/>',
    shell: '<rect width="24" height="24" rx="5" fill="#1E1E1E"/><text x="12" y="16" text-anchor="middle" font-family="Consolas, monospace" font-size="11" font-weight="700" fill="#4AF626">&gt;_</text>',
    vite: '<path d="M22 4 12 22 2 4l7.5 1.2L12 10l2.5-4.8z" fill="#FFC817"/><path d="M12 22 9.5 5.2 12 10l2.5-4.8z" fill="#646CFF"/>',
    electron: '<circle cx="12" cy="12" r="2" fill="#47848F"/><g stroke="#47848F" stroke-width="1.2" fill="none"><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/></g>',
    elixir: '<path d="M12 2c-5 6-8 9-8 14a8 8 0 0 0 16 0c0-5-3-8-8-14z" fill="#4B275F"/><path d="M12 6.5c-3 4-5 6.3-5 9.5a5 5 0 0 0 10 0c0-3.2-2-5.5-5-9.5z" fill="#fff"/>',
    graphql: '<path d="M12 2 21 7v10l-9 5-9-5V7z" fill="#E10098"/><path d="M12 6.4 5.5 10.1v3.8L12 17.6l6.5-3.7v-3.8z" fill="none" stroke="#fff" stroke-width="1.2"/>'
  };

  // Shape hints for monogram badges (keys not in BRAND_ICONS).
  var MONO_SHAPES = {
    node: 'hex', go: 'circle', nextjs: 'circle', github: 'circle'
  };

  window.BRAND_ICONS = BRAND_ICONS;
  window.MONO_SHAPES = MONO_SHAPES;

  // Returns a brand icon (SVG) or a colored monogram badge for a stack key.
  window.stackIconHtml = function (key, className) {
    var cls = className || '';
    if (BRAND_ICONS[key]) {
      return '<svg class="brand-ic ' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + BRAND_ICONS[key] + '</svg>';
    }
    var m = window.STACKS[key];
    var bg = m ? m.bg : '#eef0ff';
    var fg = m ? m.fg : '#6d7cf2';
    var mono = m ? m.mono : String(key || '?').slice(0, 2).toUpperCase();
    var shape = MONO_SHAPES[key] || 'square';
    return '<span class="brand-mono ' + shape + ' ' + cls + '" style="background:' + bg + ';color:' + fg + '">' + mono + '</span>';
  };
})();
