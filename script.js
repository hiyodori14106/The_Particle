let e = 1;
fiction a () {
  document.getElementById("text").textContent = e;
  e++;
  
}
setInterval(a, 1000); 
