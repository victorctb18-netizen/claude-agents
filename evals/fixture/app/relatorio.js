const { formatarMoeda, taxaJuros } = require('./grande');

function linhaRelatorio(nome, valor) {
  const juros = taxaJuros(valor);
  return nome + ': ' + formatarMoeda(valor + juros);
}

function rodape(total) {
  return 'Soma geral ' + formatarMoeda(total);
}

module.exports = { linhaRelatorio, rodape };
