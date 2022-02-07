module.exports = {
  call: function (fn) {
    return fn(Array.prototype.slice.call(arguments, 1, -1));
  },
  set: function (variable, value) {
    const context = arguments[arguments.length - 1].data.root;
    context[variable] = value;
  }
};
