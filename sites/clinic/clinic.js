// Fernbrook Family Clinic: a made-up clinic for the Milo demo. Fake doctors, fake slots. Nothing is booked.
(function () {
  const look2 = Demo.look === 2;
  const $ = (sel, root = document) => root.querySelector(sel);

  function chrome() {
    $('#site-header').innerHTML = `
      <div class="util"><a href="signin.html">Patient sign in</a><a href="#">Español</a><a href="#">Pay a bill</a><a href="#">Contact</a></div>
      <header class="top">
        <a class="logo" href="./">Fernbrook Family Clinic<small>Caring for the valley since 1984</small></a>
        <span class="phone">Front desk: 555-0142</span>
      </header>`;
    $('#site-footer').innerHTML = `
      <footer class="foot"><a href="#">Opening hours</a><a href="#">Directions</a><a href="#">Privacy</a><a href="#">Accessibility</a></footer>
      <p class="demo-note">Demo site for the Milo project at HackUMass. Fernbrook Family Clinic is made up, the data is fake, and nothing is booked.</p>`;
  }

  // ---- sign in, then a code from "your phone" ----
  function signin() {
    const CODE = '482913';
    const form = $('#signin');
    const codeForm = $('#code');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.email.value.trim() || !form.password.value) {
        $('#signin-error').textContent = 'Error 401: credentials required.';
        return;
      }
      form.hidden = true;
      codeForm.hidden = false;
      $('#phone-code').textContent = CODE;
      $('#demo-phone').hidden = false;
      history.pushState(null, '', '#code');
      $('h1').textContent = 'Check your phone';
    });
    codeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (codeForm.code.value.replace(/\D/g, '') !== CODE) {
        $('#code-error').textContent = 'Invalid OTP. Authentication failed.';
        return;
      }
      Demo.store.set('signed-in', '1');
      location.href = 'book.html';
    });
  }

  // ---- booking: four steps that change in place, without loading a new page ----
  function book() {
    const form = $('#booking');
    const ORDER = ['who', 'when', 'you', 'check'];
    const TITLES = { who: 'Who would you like to see?', when: 'Pick a day and a time', you: 'Your details', check: 'Check and confirm' };
    const DOCTORS = {
      okafor: 'Dr. Amara Okafor',
      herrera: 'Dr. Luis Herrera',
      whitfield: 'Dana Whitfield, nurse practitioner',
    };
    const picked = { day: '', time: '' };

    // Month, day and year as three small dropdowns, as many clinics do.
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    form.dob_month.innerHTML = '<option value="">Month</option>' + months.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    form.dob_day.innerHTML = '<option value="">Day</option>' + Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('');
    form.dob_year.innerHTML = '<option value="">Year</option>' + Array.from({ length: 90 }, (_, i) => `<option>${2008 - i}</option>`).join('');

    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const nice = (isoDay) => new Date(`${isoDay}T12:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const last = new Date();
    last.setDate(last.getDate() + 45);
    const SLOTS = ['9:00 am', '9:30 am', '10:30 am', '11:00 am', '1:30 pm', '2:00 pm', '3:30 pm', '4:00 pm'];
    const isWeekend = (isoDay) => [0, 6].includes(new Date(`${isoDay}T12:00`).getDay());

    if (look2) {
      // The redesigned site draws its own calendar and time buttons.
      $('#when-native').remove();
      const box = $('#when-custom');
      box.hidden = false;
      let shown = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1);
      const drawCal = () => {
        const y = shown.getFullYear();
        const m = shown.getMonth();
        const first = new Date(y, m, 1).getDay();
        const days = new Date(y, m + 1, 0).getDate();
        let cells = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span>${d}</span>`).join('') + '<span></span>'.repeat(first);
        for (let d = 1; d <= days; d++) {
          const day = iso(new Date(y, m, d));
          const off = day < iso(tomorrow) || day > iso(last) || isWeekend(day);
          cells += `<button type="button" data-day="${day}"${off ? ' disabled' : ''}${picked.day === day ? ' class="picked"' : ''}>${d}</button>`;
        }
        $('.cal', box).innerHTML = `
          <div class="cal-head"><button type="button" data-move="-1">‹</button><span>${months[m]} ${y}</span><button type="button" data-move="1">›</button></div>
          <div class="cal-grid">${cells}</div>`;
        $('.slots', box).innerHTML = picked.day
          ? SLOTS.map((s) => `<button type="button" data-slot="${s}"${picked.time === s ? ' class="picked"' : ''}>${s}</button>`).join('')
          : '<span class="tiny">Pick a day first.</span>';
      };
      box.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.move) shown = new Date(shown.getFullYear(), shown.getMonth() + Number(t.dataset.move), 1);
        if (t.dataset.day) picked.day = t.dataset.day;
        if (t.dataset.slot) picked.time = t.dataset.slot;
        drawCal();
      });
      drawCal();
    } else {
      form.day.min = iso(tomorrow);
      form.day.max = iso(last);
      form.time.innerHTML = '<option value="">Choose a time</option>' + SLOTS.map((s) => `<option>${s}</option>`).join('');
      form.day.addEventListener('change', () => (picked.day = form.day.value));
      form.time.addEventListener('change', () => (picked.time = form.time.value));
    }

    const problems = {
      who: () => (!form.reason.value ? 'Please choose a reason for your visit.' : !form.doctor.value ? 'Please choose who you would like to see.' : ''),
      when: () =>
        !picked.day ? 'Please pick a day.' : isWeekend(picked.day) ? 'The clinic is closed at weekends. Please pick a weekday.' : !picked.time ? 'Please pick a time.' : '',
      you: () =>
        !form.first.value.trim() || !form.last.value.trim()
          ? 'Please fill in your first and last name.'
          : !form.dob_month.value || !form.dob_day.value || !form.dob_year.value
            ? 'Please choose your date of birth.'
            : !form.phone.value.trim()
              ? 'Please add a phone number so we can reach you.'
              : '',
      check: () => '',
    };

    const show = (step, push) => {
      for (const s of ORDER) $(`[data-step="${s}"]`).hidden = s !== step;
      document.querySelectorAll('.steps li').forEach((li, i) => li.classList.toggle('on', i <= ORDER.indexOf(step)));
      $('h1').textContent = TITLES[step];
      $('#error').textContent = '';
      $('#back').hidden = step === 'who';
      $('#next').hidden = step === 'check';
      $('#confirm').hidden = step !== 'check';
      if (step === 'check') {
        $('#review').innerHTML = `
          <dt>Reason</dt><dd>${form.reason.value}</dd>
          <dt>With</dt><dd>${DOCTORS[form.doctor.value]}</dd>
          <dt>When</dt><dd>${nice(picked.day)} at ${picked.time}</dd>
          <dt>Name</dt><dd>${escapeHtml(form.first.value)} ${escapeHtml(form.last.value)}</dd>
          <dt>Phone</dt><dd>${escapeHtml(form.phone.value)}</dd>
          <dt>Reminder</dt><dd>${form.remind.checked ? 'Text message the day before' : 'None'}</dd>`;
      }
      // The address changes but the page does not reload.
      if (push) history.pushState({ step }, '', `#${step}`);
      current = step;
    };
    let current = 'who';

    $('#next').addEventListener('click', () => {
      const problem = problems[current]();
      if (problem) return void ($('#error').textContent = problem);
      show(ORDER[ORDER.indexOf(current) + 1], true);
    });
    $('#back').addEventListener('click', () => show(ORDER[ORDER.indexOf(current) - 1], true));
    window.addEventListener('popstate', (e) => show(e.state?.step ?? 'who', false));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (current !== 'check') return;
      // Nothing is sent anywhere. Kept only for the next page.
      Demo.store.set('visit', JSON.stringify({ who: DOCTORS[form.doctor.value], when: `${nice(picked.day)} at ${picked.time}`, name: form.first.value.trim() }));
      location.href = 'confirmed.html';
    });
    show('who', false);
    Demo.startTimeout(() => {
      form.reset();
      picked.day = picked.time = '';
      show('who', true);
    });
  }

  function confirmed() {
    try {
      const v = JSON.parse(Demo.store.get('visit', 'null'));
      if (v) $('#visit').textContent = `${v.name ? v.name + ', you' : 'You'} are seeing ${v.who} on ${v.when}.`;
    } catch {}
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  chrome();
  ({ signin, book, confirmed })[document.body.dataset.page]?.();
})();
