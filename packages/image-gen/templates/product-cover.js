initTemplate(function (ctx) {
  var params = ctx.params,
    brandName = ctx.brandName;
  document.getElementById('footerName').textContent = brandName;

  var badge = params.get('badge');
  var subtitle = params.get('subtitle') || params.get('text');
  var icon = params.get('icon');

  if (badge) document.getElementById('badge').textContent = badge;
  if (subtitle) document.getElementById('subtitle').textContent = subtitle;
  if (icon) document.getElementById('heroIcon').textContent = icon;
});
