/**
 * Corrige imagens dos produtos Pó Facial em extra-products.ts:
 * a URL D_NQ_NP_989449 é de um pincel; substitui por imagens reais de pó/compacto.
 */
const fs = require('fs');
const path = require('path');
const extraPath = path.join(__dirname, '../src/data/extra-products.ts');

// URLs de pó facial / compacto reais (do catálogo Base com nome "Pó" ou produtos de pó)
const PO_FACIAL_IMAGES = [
  'https://http2.mlstatic.com/D_NQ_NP_952531-MLA95080420675_102025-F.jpg', // Vult pó compacto
  'https://http2.mlstatic.com/D_NQ_NP_879922-MLU69244444306_052023-F.jpg', // Miss Rose
  'https://http2.mlstatic.com/D_NQ_NP_802154-MLU72959058392_112023-F.jpg', // Vivai pó
  'https://http2.mlstatic.com/D_NQ_NP_935650-MLU69671543827_052023-F.jpg', // Fenzza pó
  'https://http2.mlstatic.com/D_NQ_NP_867983-MLA100481895134_122025-F.jpg', // Maproderm
  'https://http2.mlstatic.com/D_NQ_NP_733991-MLU75895684497_042024-F.jpg', // Rubies pó
  'https://http2.mlstatic.com/D_NQ_NP_855430-MLA103534342696_012026-F.jpg', // Panvel pó
  'https://http2.mlstatic.com/D_NQ_NP_659755-MLA104593262455_012026-F.jpg', // Pó translúcido
  'https://http2.mlstatic.com/D_NQ_NP_882627-MLU76974757413_062024-F.jpg', // Base
  'https://http2.mlstatic.com/D_NQ_NP_601845-MLU75983835642_052024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_875197-MLU77833281385_072024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_941088-MLU54963140402_042023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_613769-MLU69368171660_052023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_704521-MLU78333687771_082024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_985891-MLU74479974644_022024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_610936-MLU74983218400_032024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_812705-MLB73980598144_012024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_909705-MLB51231391403_082022-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_733264-MLA91731202972_092025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_951331-MLU73603190072_122023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_909826-MLU73600335078_122023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_881958-MLU79139856058_092024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_959005-MLU74073224756_012024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_840977-MLA80137249679_102024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_949226-MLU73674222597_122023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_839429-MLA104549265055_012026-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_704755-MLA95121387202_102025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_884959-MLB50302759713_062022-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_972728-MLA92301016064_092025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_855482-MLU75008269793_032024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_636449-MLU73192384976_122023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_835700-MLU76131719889_052024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_638878-MLU70261106426_072023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_609136-MLU70065317607_062023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_835434-MLU78711980652_092024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_856472-MLA92888067868_092025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_875139-MLU75085475499_032024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_947928-MLU73776778131_012024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_745714-MLU69936415003_062023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_882552-MLU70983555681_082023-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_830187-MLU77312269780_072024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_665388-MLU74856569979_032024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_736227-MLA99539837754_122025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_783791-MLA94027934221_102025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_973828-MLA83082172131_032025-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_848406-MLU75855818127_042024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_882066-MLA79696551133_102024-F.jpg',
  'https://http2.mlstatic.com/D_NQ_NP_980286-MLU73438295332_122023-F.jpg',
];

const BAD_URL = 'https://http2.mlstatic.com/D_NQ_NP_989449-MLU74869282656_032024-F.jpg';

let content = fs.readFileSync(extraPath, 'utf8');
let idx = 0;
// Replace each occurrence of the brush URL in the Pó Facial section with the next image from the list
content = content.replace(new RegExp(BAD_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => {
  const url = PO_FACIAL_IMAGES[idx % PO_FACIAL_IMAGES.length];
  idx++;
  return url;
});

fs.writeFileSync(extraPath, content, 'utf8');
console.log('Pó Facial: substituídas', idx, 'imagens de pincel por imagens de pó/compacto.');
