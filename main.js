// Random hero headline
const heroHeadline = document.getElementById('heroHeadline');
if (heroHeadline) {
  const headlines = ['Strength Through Connection', 'Access Changes Everything'];
  heroHeadline.textContent = headlines[Math.floor(Math.random() * headlines.length)];
}

// Font toggle (Ctrl+Shift+F or ?font=serif URL param)
function initFontToggle() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('font') === 'serif') {
    document.documentElement.classList.add('font-serif');
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      document.documentElement.classList.toggle('font-serif');
    }
  });
}
initFontToggle();

// Palette toggle (Ctrl+Shift+P or ?palette=warm URL param)
function initPaletteToggle() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('palette') === 'warm') {
    document.documentElement.classList.add('palette-warm');
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      document.documentElement.classList.toggle('palette-warm');
    }
  });
}
initPaletteToggle();

// Logo toggle (Ctrl+Shift+L or ?logo=type URL param)
function initLogoToggle() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('logo') === 'type') {
    document.documentElement.classList.add('logo-type');
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'L') {
      e.preventDefault();
      document.documentElement.classList.toggle('logo-type');
      swapLogos();
    }
  });

  // Initial swap if logo-type is set
  if (document.documentElement.classList.contains('logo-type')) {
    swapLogos();
  }
}

// Shared function to swap logos based on theme and logo-type state
function swapLogos() {
  const isType = document.documentElement.classList.contains('logo-type');
  const isLight = document.documentElement.classList.contains('light');

  document.querySelectorAll('.nav-logo, .footer-logo').forEach((container) => {
    const img = container.querySelector('img[data-logo-dark][data-logo-light]');
    let svg = container.querySelector('.logo-type-svg');

    if (isType) {
      // Create SVG text logo if it doesn't exist (MacArthur style: horizontal with bar on top)
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'logo-type-svg');
        svg.setAttribute('viewBox', '0 0 180 40');
        svg.setAttribute('aria-label', 'The Signals Institute');
        svg.innerHTML = `
          <rect x="0" y="4" width="50" height="1.5" fill="currentColor"/>
          <text x="0" y="28" font-family="Georgia, serif" font-size="16" font-weight="400" fill="currentColor">The Signals Institute</text>
        `;
        container.appendChild(svg);
      }
      // Hide image, show SVG
      if (img) img.style.display = 'none';
      svg.style.display = 'block';
    } else {
      // Show image, hide SVG
      if (img) {
        img.style.display = 'block';
        const darkSrc = img.getAttribute('data-logo-dark');
        const lightSrc = img.getAttribute('data-logo-light');
        img.setAttribute('src', isLight ? lightSrc : darkSrc);
      }
      if (svg) svg.style.display = 'none';
    }
  });
}

initLogoToggle();

// nav shrink
const nav = document.getElementById('nav');
if (nav) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  });
}

// reveal on scroll
const revealEls = Array.from(document.querySelectorAll('.reveal'));
if (revealEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => io.observe(el));
}

// mobile menu
const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');
if (menuBtn && mobileMenu) {
  const mobileLinks = Array.from(document.querySelectorAll('.mobile-links a'));
  const toggleMenu = () => {
    const open = mobileMenu.getAttribute('data-open') === 'true';
    mobileMenu.setAttribute('data-open', (!open).toString());
    document.body.classList.toggle('menu-open', !open);
  };
  menuBtn.addEventListener('click', toggleMenu);
  mobileLinks.forEach(a => a.addEventListener('click', () => {
    mobileMenu.setAttribute('data-open', 'false');
    document.body.classList.remove('menu-open');
  }));
}

// programs tabs
const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
if (tabButtons.length) {
  const panels = {
    youth: document.getElementById('tab-youth'),
    veterans: document.getElementById('tab-veterans'),
    community: document.getElementById('tab-community'),
  };
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      Object.values(panels).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const key = btn.getAttribute('data-tab');
      panels[key]?.classList.add('active');
    });
  });
}

// footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Theme toggle (adds/removes `light` on <html>)
const themeToggleBtn = document.getElementById('themeToggle');
const THEME_KEY = 'theme';
const getPreferredTheme = () => {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
};
const applyTheme = (theme) => {
  document.documentElement.classList.toggle('light', theme === 'light');
  localStorage.setItem(THEME_KEY, theme);
  if (themeToggleBtn) themeToggleBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');

  // Swap logos based on theme and logo-type state
  swapLogos();
};
try {
  applyTheme(getPreferredTheme());
} catch {
  // ignore storage errors
}
if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.documentElement.classList.contains('light');
    applyTheme(isLight ? 'dark' : 'light');
  });
}

// Custom mouse tracker (desktop only)
(() => {
  if (!window.matchMedia) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const outer = document.createElement('div');
  outer.className = 'mouseCursor cursor-outer';
  const inner = document.createElement('div');
  inner.className = 'mouseCursor cursor-inner';
  document.body.appendChild(outer);
  document.body.appendChild(inner);

  let x = 0;
  let y = 0;
  const onMove = (e) => {
    x = e.clientX;
    y = e.clientY;
    const t = `translate(${x}px, ${y}px)`;
    outer.style.transform = t;
    inner.style.transform = t;
  };
  window.addEventListener('mousemove', onMove, { passive: true });

  const setHover = (on) => {
    outer.classList.toggle('cursor-hover', on);
    inner.classList.toggle('cursor-hover', on);
  };
  const setBig = (on) => {
    outer.classList.toggle('cursor-big', on);
    inner.classList.toggle('cursor-big', on);
  };

  document.querySelectorAll('a, button').forEach((el) => {
    el.addEventListener('mouseenter', () => setHover(true));
    el.addEventListener('mouseleave', () => setHover(false));
  });
  document.querySelectorAll('h1, h2, h3, h4, h5, h6, p').forEach((el) => {
    el.addEventListener('mouseenter', () => setBig(true));
    el.addEventListener('mouseleave', () => setBig(false));
  });
})();

// Dependent dropdowns for Connect form
const interestOptions = {
  student: ['Explore programs', 'Get mentorship', 'Stay informed', 'Join a camp'],
  veteran: ['Career pathways', 'Training programs', 'Stay informed', 'Get hired'],
  parent: ['Programs for my child', 'Volunteer', 'Stay informed'],
  volunteer: ['Volunteer', 'Mentor', 'Host events', 'Stay informed'],
  employer: ['Hire veterans', 'Corporate engagement', 'Partnership', 'On-site programs'],
  educator: ['Host programs', 'Partnership', 'Curriculum resources'],
  funder: ['Donate', 'Apply for a grant', 'Corporate sponsorship'],
  community: ['Stay informed', 'Volunteer', 'Learn more']
};

const identitySelect = document.getElementById('identity');
const interestSelect = document.getElementById('interest');
const combinedSelection = document.getElementById('combined-selection');

if (identitySelect && interestSelect) {
  identitySelect.addEventListener('change', function() {
    const selectedIdentity = this.value;
    
    // Clear and reset interest dropdown
    interestSelect.innerHTML = '<option value="">Select what you\'re looking for</option>';
    
    if (selectedIdentity && interestOptions[selectedIdentity]) {
      // Enable dropdown and populate options
      interestSelect.disabled = false;
      interestOptions[selectedIdentity].forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.toLowerCase().replace(/\s+/g, '-');
        opt.textContent = option;
        interestSelect.appendChild(opt);
      });
    } else {
      // Disable dropdown if no identity selected
      interestSelect.disabled = true;
    }
    
    // Update combined selection field
    updateCombinedSelection();
  });

  interestSelect.addEventListener('change', updateCombinedSelection);

  function updateCombinedSelection() {
    const identity = identitySelect.options[identitySelect.selectedIndex]?.text || '';
    const interest = interestSelect.options[interestSelect.selectedIndex]?.text || '';
    if (identity && interest) {
      combinedSelection.value = `${identity} → ${interest}`;
    } else {
      combinedSelection.value = '';
    }
  }
}

// The on-page card form was retired: donations go through the hosted Payment Link on donate.html and contribute.html.
// (Publishable key kept below as committed; nothing on the site loads Stripe.js.)
const STRIPE_PK = 'pk_live_51RwVImEgsINI6NxI8ZzueKx6Ld1KG9kMcRLiDUm3PEuwU3YzuPiORMKrFK9oGJ8GrCIC5pVfKCVJr8iirjUmQ3kA00KGoYKUNZ';
