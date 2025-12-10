   document.addEventListener("DOMContentLoaded", function () {
            let e = 1;

            function a() {
                const el = document.getElementById("text");
                if (el) {
                    el.textContent = e;
                    e++;
                }
            }

            
            a();

            setInterval(a, 1000);
