 let a = 0;
function buttonClick(arg) {
    a++;
}
let button = document.getElementById('button1');
button.addEventListener('click', function() {
    buttonClick(1);
  document.getElementById("text").textContent = a;
});
  


