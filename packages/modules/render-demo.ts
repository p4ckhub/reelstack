import { renderToFile } from '@reelstack/image-gen';
import { carouselEssentialsPack } from '../../../reelstack-modules/src/image-gen-templates/carousel-essentials/index';

const BRANDS_DIR = '/Users/pavvel/workspace/projects/reelstack-modules/src/brands';
const OUT_DIR = '/tmp/karuzela-demo-tsa-vercel-vs-vps';
const ESSENTIALS_PACK_DIR = carouselEssentialsPack.templatesDir;

interface SlideSpec {
  file: string;
  template: string;
  pack?: 'core' | 'carousel-essentials';
  params: Record<string, string>;
}

const slides: SlideSpec[] = [
  {
    file: 'slide-01.png',
    template: 'carousel-hook',
    pack: 'carousel-essentials',
    params: {
      badge: 'MATCHUP',
      title: 'Vercel Pro vs Mikrus VPS',
      titleHighlight: 'Mikrus VPS',
      num: '01/08',
    },
  },
  {
    file: 'slide-02.png',
    template: 'comparison',
    pack: 'carousel-essentials',
    params: {
      heading: 'Matematyka rocznych kosztów',
      title: 'Vercel Pro',
      subtitle: 'Mikrus VPS',
      price: '4 800 PLN',
      price2: '35 PLN',
      bullets: 'HTTPS automatyczny|Deploy z gita|Monitoring|Limity bandwidth|Surcharge przy spike',
      features: 'HTTPS przez Caddy|Deploy z gita|Monitoring|Bez limitów|25 stron na 1 serwerze',
      badge: 'VS',
      num: '02/08',
    },
  },
  {
    file: 'slide-03.png',
    template: 'point',
    params: {
      badge: 'Cennik',
      num: '03/08',
      title: 'Mikrus VPS = 35 PLN/rok',
      titleHighlight: '35 PLN/rok',
      text: 'Tak, na rok. Pełny serwer Linux z SSH. Hostujesz na nim 25 stron klientów jednocześnie.',
    },
  },
  {
    file: 'slide-04.png',
    template: 'point',
    params: {
      badge: 'Stack',
      num: '04/08',
      title: 'Caddy + Docker w 15 minut',
      titleHighlight: '15 minut',
      text: 'Caddy podaje SSL z Let’s Encrypt automatycznie. Docker izoluje strony. Backup co dobę przez cron.',
    },
  },
  {
    file: 'slide-05.png',
    template: 'myth',
    params: {
      heading: 'Przekonanie',
      num: '05/08',
      myth: 'VPS jest trudny, trzeba znać Linuxa od podszewki.',
      reality: '15 minut ze Stackpilot. Caddy + Docker + SSL z Let’s Encrypt automatycznie.',
    },
  },
  {
    file: 'slide-06.png',
    template: 'quote-card',
    params: {
      text: 'Te same funkcje. 137× taniej. Bez vendor lock-inu.',
      attr: 'techskills.academy',
      num: '06/08',
    },
  },
  {
    file: 'slide-07.png',
    template: 'tip-card',
    params: {
      badge: 'DEPLOY',
      title: 'Skomentuj DEPLOY pod tym postem',
      bullets:
        'PDF: Własny hosting w 15 minut|Konkretny stack krok po kroku|Zero kursów mistrzowskich, po prostu plik',
      num: '07/08',
    },
  },
  {
    file: 'slide-08.png',
    template: 'engage-outro',
    pack: 'carousel-essentials',
    params: {
      title: 'Pomogło?',
      subtitle: 'Obserwuj|po więcej',
      attr: 'Paweł Jurczyk · @techskillsacademy',
      logo: '/Users/pavvel/workspace/vault/brands/techskills-academy/brand/pawel-profile.png',
      num: '08/08',
    },
  },
];

for (const slide of slides) {
  const templatesDir = slide.pack === 'carousel-essentials' ? ESSENTIALS_PACK_DIR : undefined;
  await renderToFile(
    {
      brand: 'techskills',
      template: slide.template,
      size: 'carousel',
      ...slide.params,
    },
    `${OUT_DIR}/${slide.file}`,
    BRANDS_DIR,
    templatesDir
  );
  console.log(`Rendered ${slide.file} (${slide.template})`);
}
console.log('All slides rendered');
