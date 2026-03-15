initTemplate(function (ctx) {
  var params = ctx.params, brandName = ctx.brandName;
  document.getElementById('footerName').textContent = brandName;

  var title = params.get('title');
  var subtitle = params.get('subtitle');
  var number = params.get('number');
  var logo = params.get('logo');

  if (title) document.getElementById('title').textContent = title;
  if (subtitle) document.getElementById('subtitle').textContent = subtitle;
  else document.getElementById('subtitle').style.display = 'none';

  if (number) document.getElementById('decoNum').textContent = number;

  if (logo) {
    var el = document.getElementById('logo');
    el.src = 'file://' + logo;
    el.style.display = 'block';
  }

  autoSizeText(document.getElementById('title'), [
    [30, 6.5], [50, 5.5], [80, 4.5], [Infinity, 3.5]
  ], 0.4);
});
