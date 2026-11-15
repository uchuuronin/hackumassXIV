// Pennywhistle Home: a made-up shop for the Milo demo. Fake products, fake prices. Nothing is bought.
(function () {
  const look2 = Demo.look === 2;
  const WORDS = look2
    ? { add: 'Add to bag', basket: 'Your bag', checkout: 'Go to checkout', keep: 'Keep browsing', place: 'Complete purchase', save: 'Move to wishlist' }
    : { add: 'Add to basket', basket: 'Your basket', checkout: 'Checkout', keep: 'Continue shopping', place: 'Place order', save: 'Save for later' };

  const PRODUCTS = [
    { id: 'lamp', name: 'Brass reading lamp', price: 34.0, was: 42.0, icon: '💡', blurb: 'Warm light, heavy base, easy rocker switch.' },
    { id: 'blanket', name: 'Wool lap blanket', price: 28.5, icon: '🧣', blurb: 'Soft checked wool, 40 by 50 inches.' },
    { id: 'timer', name: 'Large-number kitchen timer', price: 12.99, icon: '⏲️', blurb: 'Big digits and a loud ring.' },
    { id: 'teapot', name: 'Two-cup teapot', price: 19.0, was: 24.0, icon: '🫖', blurb: 'Stoneware, drip-free spout.' },
    { id: 'kneeler', name: 'Garden kneeler seat', price: 24.0, icon: '🪴', blurb: 'Kneel or sit. Folds flat.' },
    { id: 'opener', name: 'Easy-grip jar opener', price: 9.5, icon: '🫙', blurb: 'Opens stubborn lids with one twist.' },
  ];
  const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

  const ICON = {
    search: '<svg class="icon-search" viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="M15 15l6 6"/></svg>',
    basket: '<svg class="icon-basket" viewBox="0 0 24 24"><path d="M3 9h18l-2 11H5L3 9z"/><path d="M8 9l4-6 4 6"/></svg>',
    trash: '<svg class="icon-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  };

  // ---- basket, kept in this browser only ----
  const basket = {
    read() {
      try {
        return JSON.parse(localStorage.getItem('demo-basket') || 'null') ?? { lamp: 1, teapot: 1, timer: 2 };
      } catch {
        return {};
      }
    },
    write(items) {
      try {
        localStorage.setItem('demo-basket', JSON.stringify(items));
      } catch {}
    },
    count() {
      return Object.values(this.read()).reduce((a, b) => a + b, 0);
    },
  };

  function totals(extraDelivery = 0) {
    const items = basket.read();
    const subtotal = Object.entries(items).reduce((sum, [id, qty]) => sum + (byId[id]?.price ?? 0) * qty, 0);
    const delivery = subtotal === 0 ? 0 : (subtotal >= 60 ? 0 : 5.95) + extraDelivery;
    const tax = Math.round(subtotal * 0.0625 * 100) / 100;
    return { subtotal, delivery, tax, total: subtotal + delivery + tax };
  }

  // ---- header and footer, the same on every page ----
  function chrome() {
    document.getElementById('site-header').innerHTML = `
      <div class="util"><a href="#">Sign in</a><a href="#">Orders</a><a href="#">Help</a><a href="#">Store finder</a><a href="#">Gift cards</a></div>
      <header class="top">
        <a class="logo" href="./">Pennywhistle Home</a>
        <form class="search" role="search" action="./">
          <input type="search" name="q" placeholder="Search">
          <button type="submit" class="btn-icon">${ICON.search}</button>
        </form>
        <a class="basket-link" href="basket.html">${ICON.basket}<span class="count">${basket.count()}</span></a>
      </header>
      <nav class="cats"><a href="./">Kitchen</a><a href="./">Living room</a><a href="./">Garden</a><a href="./">Sale</a></nav>`;
    document.getElementById('site-footer').innerHTML = `
      <footer class="foot">
        <a href="#">Delivery</a><a href="#">Returns</a><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Contact us</a>
      </footer>
      <p class="demo-note">Demo site for the Milo project at HackUMass. Pennywhistle Home is made up, the data is fake, and nothing is bought.</p>`;
  }

  // ---- pages ----
  function home() {
    const ad = document.getElementById('top-ad');
    if (ad) ad.src = Demo.adUrl('banner.html');
    document.getElementById('grid').innerHTML = PRODUCTS.map(
      (p) => `
      <div class="card" data-product="${p.id}">
        <div class="tile" aria-hidden="true">${p.icon}</div>
        <h3><a href="basket.html">${p.name}</a></h3>
        <div class="price">${Demo.money(p.price)}${p.was ? `<s class="was">${Demo.money(p.was)}</s>` : ''}</div>
        <button class="btn primary ${look2 ? 'bag-add' : 'add'}" type="button" data-add="${p.id}">${WORDS.add}</button>
        <a class="tiny" href="#">View details</a>
      </div>`,
    ).join('');
    document.getElementById('grid').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      const items = basket.read();
      items[btn.dataset.add] = (items[btn.dataset.add] ?? 0) + 1;
      basket.write(items);
      document.querySelector('.basket-link .count').textContent = basket.count();
      btn.textContent = 'Added ✓';
      setTimeout(() => (btn.textContent = WORDS.add), 1500);
    });
  }

  function basketPage() {
    document.querySelector('h1').textContent = WORDS.basket;
    const draw = () => {
      const items = basket.read();
      const ids = Object.keys(items).filter((id) => byId[id] && items[id] > 0);
      const lines = document.getElementById('lines');
      lines.innerHTML = ids.length
        ? ids
            .map((id) => {
              const p = byId[id];
              const options = [1, 2, 3, 4, 5].map((n) => `<option${n === items[id] ? ' selected' : ''}>${n}</option>`).join('');
              return `
          <li class="line" data-line="${id}">
            <div class="tile" aria-hidden="true">${p.icon}</div>
            <div class="info">
              <a class="name" href="./">${p.name}</a>
              <div class="meta">In stock · Usually arrives in 3 to 5 days</div>
              <a class="tiny" href="#" data-save="${id}">${WORDS.save}</a>
            </div>
            <span class="qty-label">Qty</span>
            <select name="qty_${id}" data-qty="${id}">${options}</select>
            <span class="price">${Demo.money(p.price * items[id])}</span>
            <button class="btn-icon" type="button" data-remove="${id}">${ICON.trash}</button>
          </li>`;
            })
            .join('')
        : '<li class="empty">Your basket is empty.</li>';
      const t = totals();
      document.getElementById('sum').innerHTML = `
        <dt>Subtotal</dt><dd>${Demo.money(t.subtotal)}</dd>
        <dt>Delivery</dt><dd>${t.delivery ? Demo.money(t.delivery) : 'Free'}</dd>
        <dt>Estimated tax</dt><dd>${Demo.money(t.tax)}</dd>
        <dt class="grand">Order total</dt><dd class="grand">${Demo.money(t.total)}</dd>`;
      document.querySelector('.basket-link .count').textContent = basket.count();
    };
    draw();
    document.getElementById('lines').addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove],[data-save]');
      if (!remove) return;
      e.preventDefault();
      const items = basket.read();
      delete items[remove.dataset.remove ?? remove.dataset.save];
      basket.write(items);
      draw();
    });
    document.getElementById('lines').addEventListener('change', (e) => {
      const qty = e.target.closest('[data-qty]');
      if (!qty) return;
      const items = basket.read();
      items[qty.dataset.qty] = Number(qty.value);
      basket.write(items);
      draw();
    });
    document.getElementById('keep').textContent = WORDS.keep;
    const go = document.getElementById('go-checkout');
    go.textContent = WORDS.checkout;
    if (look2) go.id = 'proceedBtn';
    // An advert drawn as a button, between the two real ones. It is a picture and it leads to another website.
    document.getElementById('pic-ad').innerHTML = `<a href="${Demo.adUrl('landing.html')}"><img src="${Demo.adUrl('continue-button.svg')}" width="220" height="46" alt=""></a>`;
    document.getElementById('side-ad').src = Demo.adUrl('banner.html?style=continue&shape=tall');
  }

  function checkoutPage() {
    const form = document.getElementById('checkout');
    const place = document.getElementById('place-order');
    place.textContent = WORDS.place;
    if (look2) place.id = 'submitOrderBtn';

    const states = ['', 'Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'New York', 'Rhode Island', 'Vermont'];
    form.querySelector('[name="state"]').innerHTML = states.map((s) => `<option value="${s}">${s || 'Choose…'}</option>`).join('');

    if (Demo.tricky) {
      // More than a shop should ever need. For the Over-Ask Alert.
      document.getElementById('extra').innerHTML = `
        <div class="f"><label for="ssn">Social Security number (to verify your rewards account)</label><input id="ssn" name="ssn" inputmode="numeric" placeholder="000-00-0000"></div>
        <div class="f"><label for="maiden">Mother's maiden name</label><input id="maiden" name="security_answer"></div>`;
    }

    const draw = () => {
      const express = form.querySelector('[name="speed"]:checked')?.value === 'express';
      const t = totals(express ? 9.99 : 0);
      document.getElementById('sum').innerHTML = `
        <dt>Subtotal</dt><dd>${Demo.money(t.subtotal)}</dd>
        <dt>Delivery</dt><dd>${t.delivery ? Demo.money(t.delivery) : 'Free'}</dd>
        <dt>Estimated tax</dt><dd>${Demo.money(t.tax)}</dd>
        <dt class="grand">Order total</dt><dd class="grand">${Demo.money(t.total)}</dd>`;
    };
    draw();
    form.addEventListener('change', draw);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Nothing is sent anywhere. Only the first name is kept, for the thank-you page.
      Demo.store.set('order-name', form.querySelector('[name="fname"]').value.trim());
      Demo.store.set('order-plus', form.querySelector('[name="plus"]').checked ? '1' : '0');
      basket.write({});
      location.href = 'confirmation.html';
    });
    Demo.startTimeout(() => form.reset());
  }

  function confirmationPage() {
    const name = Demo.store.get('order-name', '');
    document.getElementById('thanks-name').textContent = name ? `Thank you, ${name}.` : 'Thank you.';
    if (Demo.store.get('order-plus', '0') === '1') {
      document.getElementById('plus-note').textContent =
        'You also started a Pennywhistle Plus trial. It is free for 30 days, then $12.99 a month until you cancel.';
    }
  }

  chrome();
  ({ home, basket: basketPage, checkout: checkoutPage, confirmation: confirmationPage })[document.body.dataset.page]?.();
})();
