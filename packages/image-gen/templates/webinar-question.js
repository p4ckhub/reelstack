initTemplate(function (ctx) {
  var params = ctx.params;

  var question = params.get('question');
  var optA = params.get('optA');
  var optB = params.get('optB');
  var optC = params.get('optC');
  var optD = params.get('optD');
  var footer = params.get('footer');

  if (question) document.getElementById('question').textContent = question;
  if (optA) document.getElementById('optA').textContent = optA;
  if (optB) document.getElementById('optB').textContent = optB;
  if (optC) document.getElementById('optC').textContent = optC;
  if (optD) document.getElementById('optD').textContent = optD;
  if (footer) document.getElementById('footerInfo').textContent = footer;

  autoSizeText(document.getElementById('question'), [
    [30, 5], [50, 4.2], [80, 3.5], [Infinity, 2.8]
  ], 0.25);
});
