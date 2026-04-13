initTemplate(function (ctx) {
  var params = ctx.params,
    brandName = ctx.brandName;
  document.getElementById('footerName').textContent = brandName;

  var number = params.get('number');
  var myth = params.get('myth');
  var reality = params.get('reality');

  if (number) document.getElementById('headerText').textContent = 'PRZEKONANIE #' + number;
  if (myth) document.getElementById('mythText').textContent = myth;
  if (reality) document.getElementById('realityText').textContent = reality;

  autoSizeText(
    document.getElementById('mythText'),
    [
      [40, 4],
      [80, 3.2],
      [Infinity, 2.6],
    ],
    0.2
  );

  autoSizeText(
    document.getElementById('realityText'),
    [
      [40, 4],
      [80, 3.2],
      [Infinity, 2.6],
    ],
    0.2
  );
});
