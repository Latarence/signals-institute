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

  // Swap logos based on theme.
  document.querySelectorAll('img[data-logo-dark][data-logo-light]').forEach((img) => {
    const darkSrc = img.getAttribute('data-logo-dark');
    const lightSrc = img.getAttribute('data-logo-light');
    if (!darkSrc || !lightSrc) return;
    img.setAttribute('src', theme === 'light' ? lightSrc : darkSrc);
  });
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

// Stripe donation
const STRIPE_PK = 'pk_live_51RwVImEgsINI6NxI8ZzueKx6Ld1KG9kMcRLiDUm3PEuwU3YzuPiORMKrFK9oGJ8GrCIC5pVfKCVJr8iirjUmQ3kA00KGoYKUNZ';
let selectedAmount = 100;
let stripe, elements, cardElement;

async function initStripe() {
  if (typeof Stripe === 'undefined') return;
  
  stripe = Stripe(STRIPE_PK);
  elements = stripe.elements();
  cardElement = elements.create('card', {
    style: {
      base: { color: '#fff', fontSize: '16px', '::placeholder': { color: '#888' } },
      invalid: { color: '#ff6b6b' }
    }
  });
  cardElement.mount('#card-element');

  cardElement.on('change', (e) => {
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) submitBtn.disabled = e.complete ? false : true;
  });
}

if (document.getElementById('card-element')) {
  initStripe();
}

document.querySelectorAll('.amt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedAmount = parseInt(btn.dataset.amount);
    const btnAmount = document.getElementById('btn-amount');
    const customAmount = document.getElementById('custom-amount');
    if (btnAmount) btnAmount.textContent = '$' + selectedAmount;
    if (customAmount) customAmount.value = '';
  });
});

const customAmountInput = document.getElementById('custom-amount');
if (customAmountInput) {
  customAmountInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    if (val > 0) {
      selectedAmount = val;
      const btnAmount = document.getElementById('btn-amount');
      if (btnAmount) btnAmount.textContent = '$' + val;
      document.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('selected'));
    }
  });
}

const paymentForm = document.getElementById('payment-form');
if (paymentForm) {
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const msg = document.getElementById('payment-message');
    if (!btn || !msg) return;
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
      const res = await fetch('/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: selectedAmount })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const { error, paymentIntent } = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: cardElement }
      });

      if (error) {
        msg.textContent = error.message;
        msg.style.color = '#ff6b6b';
        btn.disabled = false;
        btn.innerHTML = 'Donate <span id="btn-amount">$' + selectedAmount + '</span>';
      } else if (paymentIntent.status === 'succeeded') {
        document.querySelector('.donation-amounts').style.display = 'none';
        document.querySelector('.custom-amount').style.display = 'none';
        document.getElementById('card-element').style.display = 'none';
        btn.style.display = 'none';
        document.querySelector('.stripe-powered').style.display = 'none';
        
        msg.innerHTML = '<div style="text-align:center;padding:2rem;"><h3 style="color:#4ade80;font-size:1.5rem;margin-bottom:1rem;">Thank you for your donation!</h3><p style="color:rgba(255,255,255,0.7);">Your contribution of $' + selectedAmount + ' will directly support youth technical exposure, veteran transition, and community programs in Riviera Beach.</p></div>';
        msg.style.color = '#4ade80';
      }
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = '#ff6b6b';
      btn.disabled = false;
      btn.innerHTML = 'Donate <span id="btn-amount">$' + selectedAmount + '</span>';
    }
  });
}
