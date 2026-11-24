// The dice of the liars-dice kit: one cell of a 3 x 3 atlas, picked by _frame (0 to 5 the faces, 6 "?", 7 the red X,
// 8 the logo), tinted by _Color, lit by the main light and the ambient light. A URP remake of upstream's Amplify
// "akalink/dice flipbook" surface shader (built-in pipeline). The cell is worked out with whole numbers
// (column frame % 3, row 2 - frame / 3, frames 0 to 2 on the top row), not with upstream's generated maths, which lands
// on a cell boundary for frames 3 and 6. The page sets _frame and _Color per die through the relay's matFloat and color
// ops (on renderer.material, so every die has its own instance). Small on purpose: Quest-friendly, one pass, no shadows.
Shader "LiarsDice/DiceFlipbook"
{
    Properties
    {
        _MainTex ("Atlas (3 x 3)", 2D) = "white" {}
        _Color ("Tint", Color) = (1, 1, 1, 1)
        _frame ("Frame", Float) = 8
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode" = "UniversalForward" }
            Cull Back

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            CBUFFER_START(UnityPerMaterial)
                float4 _MainTex_ST;
                half4 _Color;
                float _frame;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                float2 uv : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv : TEXCOORD0;
                half3 normalWS : TEXCOORD1;
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings vert(Attributes input)
            {
                Varyings output;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                float frame = clamp(floor(_frame + 0.5), 0.0, 8.0);
                float column = frame - 3.0 * floor(frame / 3.0);
                float row = 2.0 - floor(frame / 3.0);
                output.uv = (saturate(input.uv) + float2(column, row)) / 3.0;
                return output;
            }

            half4 frag(Varyings input) : SV_Target
            {
                half3 albedo = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).rgb * _Color.rgb;
                half3 normal = normalize(input.normalWS);
                Light light = GetMainLight();
                half3 lit = light.color * saturate(dot(normal, light.direction)) + SampleSH(normal);
                return half4(albedo * lit, 1.0);
            }
            ENDHLSL
        }
    }
    Fallback Off
}
