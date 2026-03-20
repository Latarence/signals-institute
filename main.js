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

// Back to top button
const backToTop = document.getElementById('back-to-top');
if (backToTop) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      backToTop.classList.add('show');
      backToTop.style.display = 'flex';
    } else {
      backToTop.classList.remove('show');
      backToTop.style.display = 'none';
    }
  });
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
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
