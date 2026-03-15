initTemplate(function (ctx) {
  var params = ctx.params;

  var banner = params.get('banner');
  var dateMain = params.get('date');
  var dateTime = params.get('time');
  var features = params.get('features');
  var price1 = params.get('price1');
  var price2 = params.get('price2');
  var cta = params.get('cta');
  var logo = params.get('logo');

  if (banner) document.getElementById('bannerText').textContent = banner;
  if (dateMain) document.getElementById('dateMain').textContent = dateMain;
  if (dateTime) document.getElementById('dateTime').textContent = dateTime;
  if (price1) document.getElementById('price1').textContent = price1;
  if (price2) document.getElementById('price2').textContent = price2;
  if (cta) document.getElementById('ctaText').textContent = cta;

  if (features) {
    var container = document.getElementById('features');
    container.innerHTML = '';
    features.split('|').forEach(function (f) {
      var div = document.createElement('div');
      div.className = 'feature';
      div.textContent = f.trim();
      container.appendChild(div);
    });
  }

  if (logo) {
    var el = document.getElementById('logoBanner');
    el.src = 'file://' + logo;
    el.style.display = 'block';
  }
});
