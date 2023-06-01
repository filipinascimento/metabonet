#ifdef GL_ES
	precision highp float;
#endif
uniform float linesIntensity;

varying vec3 vColor;

void main(){
	gl_FragColor = vec4(vColor,linesIntensity);
}
