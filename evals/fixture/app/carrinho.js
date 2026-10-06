const { somarItens, formatarMoeda } = require('./grande');

function resumoCarrinho(itens) {
  if (!itens.length) return 'Carrinho vazio';
  const total = somarItens(itens);
  return 'Total: ' + formatarMoeda(total);
}

module.exports = { resumoCarrinho };
