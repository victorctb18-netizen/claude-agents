const { validarCnpj } = require('./grande');

function salvarEmpresa(dados) {
  if (!validarCnpj(dados.cnpj)) throw new Error('CNPJ inválido');
  return { ...dados, salvo: true };
}

module.exports = { salvarEmpresa };
