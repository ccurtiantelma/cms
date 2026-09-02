/**
 * Isola JS di submit dei Form pubblici (F10-04, RFC-46 N8; deroga dichiarata a N6/D7 di
 * RFC-46 — vedi il commento di `PageView.tsx` per il perché). Script piatto, non un bundle
 * React: il sito pubblico non idrata nulla (ADR-22 § 2), questa è l'unica eccezione,
 * volutamente non un motore di componenti — solo `fetch` + manipolazione DOM diretta.
 * Iniettato solo nelle pagine il cui albero contiene almeno un blocco `form`
 * (`PageView.hasFormBlock`), mai globalmente.
 *
 * Contratto del body atteso da `POST public/forms/:formId/submit`
 * (`SubmitFormDto`/`FormsService.submitForm`, backend): `{ signature, values }` più il
 * campo honeypot come chiave **top-level** a nome dinamico — mai dentro `values`, che deve
 * contenere **esattamente** i nomi dei `form-field` pubblicati (un nome imprevisto è un
 * `400`).
 */
(function () {
  'use strict';

  /** Costruisce il payload separando honeypot/firma (top-level) dai valori reali dei campi. */
  function collectPayload(form) {
    var honeypotName = null;
    var honeypotValue = '';
    var signature = '';
    var values = {};

    var elements = form.elements;
    for (var i = 0; i < elements.length; i += 1) {
      var el = elements[i];
      var name = el.name;
      if (!name) continue;

      if (el.getAttribute('data-honeypot') === 'true') {
        honeypotName = name;
        honeypotValue = el.value;
        continue;
      }
      if (name === 'signature') {
        signature = el.value;
        continue;
      }

      values[name] = el.type === 'checkbox' ? el.checked : el.value;
    }

    var payload = { signature: signature, values: values };
    if (honeypotName) {
      payload[honeypotName] = honeypotValue;
    }
    return payload;
  }

  /** Disabilita/riabilita il pulsante di invio, con testo di caricamento (istruzione "Submitting"). */
  function setSubmitting(form, submitting) {
    var button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = submitting;
    if (submitting) {
      if (button.getAttribute('data-original-label') === null) {
        button.setAttribute('data-original-label', button.textContent || '');
      }
      button.textContent = 'Invio in corso…';
    } else {
      var original = button.getAttribute('data-original-label');
      if (original !== null) button.textContent = original;
    }
  }

  /** Mostra un messaggio (successo/errore) nello slot dedicato del form. */
  function showMessage(form, variant, text) {
    var slot = form.querySelector('[data-form-message]');
    if (!slot) return;
    slot.textContent = text;
    slot.setAttribute('data-variant', variant);
    slot.hidden = false;
  }

  /**
   * Esito positivo (istruzione "Success"): nasconde i campi compilati (pulsante incluso,
   * è dentro lo stesso contenitore) e mostra solo il messaggio di conferma.
   */
  function showSuccess(form) {
    var fields = form.querySelector('[data-form-fields]');
    if (fields) fields.hidden = true;
    showMessage(form, 'success', 'Grazie, il messaggio è stato inviato con successo.');
  }

  /** Esito negativo (istruzione "Error"): messaggio sopra i campi, valori utente intatti. */
  function showError(form, text) {
    showMessage(form, 'error', text);
  }

  function handleSubmit(event) {
    var form = event.currentTarget;
    var submitUrl = form.getAttribute('data-submit-url');
    if (!submitUrl) return; // Nessun URL calcolato lato server: submit nativo disabilitato a monte, non qui.

    event.preventDefault();

    var messageSlot = form.querySelector('[data-form-message]');
    if (messageSlot) messageSlot.hidden = true;

    setSubmitting(form, true);

    fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectPayload(form)),
    })
      .then(function (response) {
        setSubmitting(form, false);
        if (response.ok) {
          showSuccess(form);
        } else {
          showError(form, 'Non è stato possibile inviare il modulo. Controlla i campi compilati e riprova.');
        }
      })
      .catch(function () {
        setSubmitting(form, false);
        showError(form, 'Errore di rete: non è stato possibile inviare il modulo. Riprova.');
      });
  }

  function init() {
    var forms = document.querySelectorAll('form[data-form-id]');
    for (var i = 0; i < forms.length; i += 1) {
      forms[i].addEventListener('submit', handleSubmit);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
