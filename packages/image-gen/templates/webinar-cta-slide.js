initTemplate(function (ctx) {
  var params = ctx.params;

  var title = params.get('title');
  var subtitle = params.get('subtitle');
  var price = params.get('price');
  var cta = params.get('cta');
  var logo = params.get('logo');

  if (title) document.getElementById('title').textContent = title;
  if (subtitle) document.getElementById('subtitle').textContent = subtitle;
  else document.getElementById('subtitle').style.display = 'none';
  if (price) document.getElementById('price').textContent = price;
  else document.getElementById('price').style.display = 'none';
  if (cta) document.getElementById('ctaText').textContent = cta;

  if (logo) {
    var el = document.getElementById('logo');
    el.src = 'file://' + logo;
    el.style.display = 'block';
  }

  autoSizeText(document.getElementById('title'), [
    [30, 4.5], [60, 3.5], [100, 2.8], [Infinity, 2.2]
  ], 0.25);
});
